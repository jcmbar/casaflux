-- Account-to-account transfers (V1): linked pair of transfer legs + atomic RPCs.
-- Credit-card invoice payment stays a separate flow (not covered here).

alter table public.transactions
  add column if not exists linked_transaction_id uuid
    references public.transactions (id) on delete set null;

create index if not exists transactions_linked_transaction_id_idx
  on public.transactions (linked_transaction_id);

comment on column public.transactions.linked_transaction_id is
  'Counterpart transaction for account transfers (A↔B). Null for normal income/expense.';

-- ============================================================
-- create_account_transfer
-- ============================================================

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

  if v_from.type not in ('checking', 'savings', 'cash')
     or v_to.type not in ('checking', 'savings', 'cash') then
    raise exception 'Transfers are only allowed between checking, savings, or cash accounts';
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

revoke all on function public.create_account_transfer(uuid, uuid, numeric, date, text) from public;
grant execute on function public.create_account_transfer(uuid, uuid, numeric, date, text) to authenticated;

comment on function public.create_account_transfer(uuid, uuid, numeric, date, text) is
  'Atomically creates a linked transfer pair (out+in) and updates both account balances. Bank accounts only (checking/savings/cash).';

-- ============================================================
-- delete_account_transfer
-- ============================================================

create or replace function public.delete_account_transfer(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_primary public.transactions%rowtype;
  v_linked public.transactions%rowtype;
  v_out public.transactions%rowtype;
  v_in public.transactions%rowtype;
  v_amount numeric(14, 2);
begin
  if v_uid is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_transaction_id is null then
    raise exception 'Transaction id is required';
  end if;

  select * into v_primary
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found';
  end if;

  if v_primary.type <> 'transfer' or v_primary.linked_transaction_id is null then
    raise exception 'Not a linked account transfer';
  end if;

  if not public.can_edit_transaction(v_primary.id, v_uid) then
    raise exception 'Not allowed to delete this transfer'
      using errcode = '42501';
  end if;

  select * into v_linked
  from public.transactions
  where id = v_primary.linked_transaction_id
  for update;

  if not found then
    raise exception 'Linked transfer leg not found';
  end if;

  if v_linked.type <> 'transfer'
     or v_linked.linked_transaction_id is distinct from v_primary.id then
    raise exception 'Transfer link is inconsistent';
  end if;

  if not public.can_edit_transaction(v_linked.id, v_uid) then
    raise exception 'Not allowed to delete the linked transfer leg'
      using errcode = '42501';
  end if;

  -- Determine out/in by description convention from create_account_transfer.
  if v_primary.description like 'Transferência para %' then
    v_out := v_primary;
    v_in := v_linked;
  elsif v_linked.description like 'Transferência para %' then
    v_out := v_linked;
    v_in := v_primary;
  else
    -- Fallback: treat primary as out if amounts match (still reverse both).
    v_out := v_primary;
    v_in := v_linked;
  end if;

  v_amount := round(v_out.amount::numeric, 2);

  if round(v_in.amount::numeric, 2) <> v_amount then
    raise exception 'Transfer leg amounts do not match';
  end if;

  -- Lock accounts before balance updates.
  perform 1 from public.accounts where id = v_out.account_id for update;
  perform 1 from public.accounts where id = v_in.account_id for update;

  update public.transactions
  set linked_transaction_id = null
  where id in (v_out.id, v_in.id);

  update public.accounts
  set balance = balance + v_amount
  where id = v_out.account_id;

  update public.accounts
  set balance = balance - v_amount
  where id = v_in.account_id;

  delete from public.transactions
  where id in (v_out.id, v_in.id);

  return jsonb_build_object(
    'deletedOutTransactionId', v_out.id,
    'deletedInTransactionId', v_in.id,
    'amount', v_amount,
    'fromAccountId', v_out.account_id,
    'toAccountId', v_in.account_id
  );
end;
$$;

revoke all on function public.delete_account_transfer(uuid) from public;
grant execute on function public.delete_account_transfer(uuid) to authenticated;

comment on function public.delete_account_transfer(uuid) is
  'Atomically deletes both legs of a linked account transfer and reverses balance effects.';
