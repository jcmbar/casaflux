-- Atomic credit-card invoice payment: source expense + card income + balances.
-- Mirrors create_account_transfer (security definer + can_post checks).

create or replace function public.create_credit_card_invoice_payment(
  p_card_account_id uuid,
  p_source_account_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_statement_cycle_id text default null,
  p_notes text default null,
  p_origin text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_amount numeric(14, 2) := round(coalesce(p_amount, 0)::numeric, 2);
  v_card public.accounts%rowtype;
  v_source public.accounts%rowtype;
  v_origin text := coalesce(nullif(trim(p_origin), ''), 'manual');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_cycle text := nullif(trim(coalesce(p_statement_cycle_id, '')), '');
  v_source_description text;
  v_card_description text;
  v_source_id uuid;
  v_card_tx_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_card_account_id is null or p_source_account_id is null then
    raise exception 'Card and source accounts are required';
  end if;

  if p_card_account_id = p_source_account_id then
    raise exception 'Source account must differ from the card';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'Invalid invoice payment amount';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required';
  end if;

  if v_origin not in ('manual', 'imported') then
    raise exception 'Invalid invoice_payment_origin';
  end if;

  select * into v_card
  from public.accounts
  where id = p_card_account_id
  for update;

  if not found then
    raise exception 'Card account not found';
  end if;

  select * into v_source
  from public.accounts
  where id = p_source_account_id
  for update;

  if not found then
    raise exception 'Source account not found';
  end if;

  if v_card.type <> 'credit_card' then
    raise exception 'Destination must be a credit card account';
  end if;

  if v_source.type = 'credit_card' then
    raise exception 'Source account cannot be a credit card';
  end if;

  if not public.can_post_to_account(p_source_account_id, v_uid) then
    raise exception 'Not allowed to post to origin account'
      using errcode = '42501';
  end if;

  if not public.can_post_to_account(p_card_account_id, v_uid) then
    raise exception 'Not allowed to post to card account'
      using errcode = '42501';
  end if;

  v_card_description := case
    when v_notes is null then 'Pagamento recebido'
    else format('Pagamento recebido — %s', v_notes)
  end;

  v_source_description := case
    when v_notes is null then 'Pagamento fatura (origem) — Pagamento recebido'
    else format('Pagamento fatura (origem) — Pagamento recebido — %s', v_notes)
  end;

  insert into public.transactions (
    description,
    amount,
    type,
    category_id,
    account_id,
    transaction_date,
    created_by,
    family_id,
    statement_cycle_id,
    invoice_payment_origin,
    reconciled_with_transaction_id
  )
  values (
    v_source_description,
    v_amount,
    'expense',
    null,
    p_source_account_id,
    p_payment_date,
    v_uid,
    v_source.family_id,
    v_cycle,
    v_origin,
    null
  )
  returning id into v_source_id;

  insert into public.transactions (
    description,
    amount,
    type,
    category_id,
    account_id,
    transaction_date,
    created_by,
    family_id,
    statement_cycle_id,
    invoice_payment_origin,
    reconciled_with_transaction_id,
    linked_transaction_id
  )
  values (
    v_card_description,
    v_amount,
    'income',
    null,
    p_card_account_id,
    p_payment_date,
    v_uid,
    v_card.family_id,
    v_cycle,
    v_origin,
    null,
    v_source_id
  )
  returning id into v_card_tx_id;

  update public.transactions
  set linked_transaction_id = v_card_tx_id
  where id = v_source_id;

  update public.accounts
  set balance = balance - v_amount
  where id = p_source_account_id;

  update public.accounts
  set balance = balance + v_amount
  where id = p_card_account_id;

  return jsonb_build_object(
    'sourceTransactionId', v_source_id,
    'cardTransactionId', v_card_tx_id,
    'amount', v_amount,
    'statementCycleId', v_cycle,
    'origin', v_origin
  );
end;
$$;

revoke all on function public.create_credit_card_invoice_payment(
  uuid, uuid, numeric, date, text, text, text
) from public;

grant execute on function public.create_credit_card_invoice_payment(
  uuid, uuid, numeric, date, text, text, text
) to authenticated;

comment on function public.create_credit_card_invoice_payment(
  uuid, uuid, numeric, date, text, text, text
) is
  'Registers a credit-card invoice payment: expense on source account + income on card, linked to statement cycle.';
