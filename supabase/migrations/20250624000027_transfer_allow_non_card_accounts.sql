-- Broaden account transfers: allow any account type except credit_card.
-- Invoice payment for cards remains a separate flow.

create or replace function public.create_account_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_transaction_date date,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_amount numeric(14, 2) := round(coalesce(p_amount, 0)::numeric, 2);
  v_from public.accounts%rowtype;
  v_to public.accounts%rowtype;
  v_base text;
  v_out_description text;
  v_in_description text;
  v_out_id uuid;
  v_in_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_from_account_id is null or p_to_account_id is null then
    raise exception 'Origin and destination accounts are required';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'Origin and destination must be different';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'Invalid transfer amount';
  end if;

  if p_transaction_date is null then
    raise exception 'Transfer date is required';
  end if;

  select * into v_from
  from public.accounts
  where id = p_from_account_id
  for update;

  if not found then
    raise exception 'Origin account not found';
  end if;

  select * into v_to
  from public.accounts
  where id = p_to_account_id
  for update;

  if not found then
    raise exception 'Destination account not found';
  end if;

  if v_from.type = 'credit_card' or v_to.type = 'credit_card' then
    raise exception 'Transfers cannot include credit card accounts';
  end if;

  if not public.can_post_to_account(p_from_account_id, v_uid) then
    raise exception 'Not allowed to post to origin account'
      using errcode = '42501';
  end if;

  if not public.can_post_to_account(p_to_account_id, v_uid) then
    raise exception 'Not allowed to post to destination account'
      using errcode = '42501';
  end if;

  v_base := nullif(trim(coalesce(p_description, '')), '');

  v_out_description := case
    when v_base is null then format('Transferência para %s', v_to.name)
    else format('Transferência para %s — %s', v_to.name, v_base)
  end;

  v_in_description := case
    when v_base is null then format('Transferência de %s', v_from.name)
    else format('Transferência de %s — %s', v_from.name, v_base)
  end;

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
    v_out_description,
    v_amount,
    'transfer',
    null,
    p_from_account_id,
    p_transaction_date,
    v_uid,
    v_from.family_id
  )
  returning id into v_out_id;

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
    v_in_description,
    v_amount,
    'transfer',
    null,
    p_to_account_id,
    p_transaction_date,
    v_uid,
    v_to.family_id
  )
  returning id into v_in_id;

  update public.transactions
  set linked_transaction_id = v_in_id
  where id = v_out_id;

  update public.transactions
  set linked_transaction_id = v_out_id
  where id = v_in_id;

  update public.accounts
  set balance = balance - v_amount
  where id = p_from_account_id;

  update public.accounts
  set balance = balance + v_amount
  where id = p_to_account_id;

  return jsonb_build_object(
    'outTransactionId', v_out_id,
    'inTransactionId', v_in_id,
    'amount', v_amount,
    'fromAccountId', p_from_account_id,
    'toAccountId', p_to_account_id
  );
end;
$$;

comment on function public.create_account_transfer(uuid, uuid, numeric, date, text) is
  'Atomically creates a linked transfer pair (out+in) and updates both account balances. All account types except credit_card.';
