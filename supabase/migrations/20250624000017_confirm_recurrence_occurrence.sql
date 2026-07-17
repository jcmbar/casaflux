-- Atomically confirm a predicted recurrence occurrence.
-- This creates the real transaction, updates the account balance and links
-- the occurrence in one database transaction.

create or replace function public.confirm_recurrence_occurrence(
  p_occurrence_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_amount numeric(12, 2);
  v_scheduled_date date;
  v_description text;
  v_type text;
  v_category_id uuid;
  v_account_id uuid;
  v_family_id uuid;
  v_transaction_id uuid;
begin
  select
    o.status,
    o.amount,
    o.scheduled_date,
    r.description,
    r.type,
    r.category_id,
    r.account_id,
    r.family_id
  into
    v_status,
    v_amount,
    v_scheduled_date,
    v_description,
    v_type,
    v_category_id,
    v_account_id,
    v_family_id
  from public.transaction_recurrence_occurrences o
  join public.transaction_recurrences r on r.id = o.recurrence_id
  where o.id = p_occurrence_id
  for update of o;

  if not found then
    raise exception 'Recurrence occurrence not found';
  end if;

  if v_status <> 'predicted' then
    raise exception 'Only predicted occurrences can be confirmed';
  end if;

  if not public.can_post_to_account(v_account_id, auth.uid()) then
    raise exception 'Not allowed to post to this account'
      using errcode = '42501';
  end if;

  insert into public.transactions (
    description,
    amount,
    type,
    category_id,
    account_id,
    transaction_date,
    created_by,
    family_id
  )
  values (
    v_description,
    v_amount,
    v_type,
    v_category_id,
    v_account_id,
    v_scheduled_date,
    auth.uid(),
    v_family_id
  )
  returning id into v_transaction_id;

  update public.accounts
  set balance = balance + case
    when v_type = 'income' then v_amount
    when v_type = 'expense' then -v_amount
    else 0
  end
  where id = v_account_id;

  update public.transaction_recurrence_occurrences
  set
    status = 'confirmed',
    source_transaction_id = v_transaction_id
  where id = p_occurrence_id;

  return v_transaction_id;
end;
$$;

revoke all on function public.confirm_recurrence_occurrence(uuid) from public;
grant execute on function public.confirm_recurrence_occurrence(uuid) to authenticated;
