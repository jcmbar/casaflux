-- P1: dual-write invoice payment linkage by due date.
-- statement_cycle_id (closing ISO text) remains for legacy compatibility.
-- New statement_due_date is the preferred attribution key.

alter table public.transactions
  add column if not exists statement_due_date date;

comment on column public.transactions.statement_due_date is
  'Credit-card invoice due date (YYYY-MM-DD) for invoice payments. Preferred over statement_cycle_id for attribution.';

create index if not exists transactions_statement_due_date_idx
  on public.transactions (statement_due_date)
  where statement_due_date is not null;

-- Backfill from persisted cycles matched by closing (card legs first).
update public.transactions t
set statement_due_date = c.due_date
from public.card_statement_cycles c
where t.statement_due_date is null
  and t.statement_cycle_id is not null
  and t.account_id = c.account_id
  and t.statement_cycle_id = to_char(c.closing_date, 'YYYY-MM-DD');

-- Copy due onto twin legs (source↔card) when only one side was backfilled.
update public.transactions t
set statement_due_date = twin.statement_due_date
from public.transactions twin
where t.statement_due_date is null
  and twin.statement_due_date is not null
  and (
    t.linked_transaction_id = twin.id
    or twin.linked_transaction_id = t.id
  );

-- Persist statement_due_date from import commit payload.
create or replace function public.commit_nubank_import(
  p_family_id uuid,
  p_account_id uuid,
  p_source text,
  p_file_name text,
  p_content_hash text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_batch_id uuid;
  v_row jsonb;
  v_tx jsonb;
  v_tx_id uuid;
  v_primary_tx_id uuid;
  v_linked_tx_id uuid;
  v_created_transactions integer := 0;
  v_created_batch_rows integer := 0;
  v_skipped_count integer := 0;
  v_skipped_rows jsonb := '[]'::jsonb;
  v_balance_delta numeric;
  v_account_id uuid;
  v_tx_type text;
  v_amount numeric;
  v_tx_index integer;
  v_category_id uuid;
  v_statement_cycle_id text;
  v_statement_due_date date;
  v_invoice_payment_origin text;
begin
  if v_uid is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_source not in ('nubank_checking', 'nubank_credit_card', 'inter_checking', 'bradesco_checking') then
    raise exception 'Invalid import source';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import rows payload must be a JSON array';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'No rows to commit';
  end if;

  if not public.can_post_to_account(p_account_id, v_uid) then
    raise exception 'Cannot post to target account'
      using errcode = '42501';
  end if;

  insert into public.import_batches (
    owner_user_id,
    family_id,
    account_id,
    source,
    file_name,
    content_hash,
    row_count,
    status
  )
  values (
    v_uid,
    p_family_id,
    p_account_id,
    p_source,
    p_file_name,
    p_content_hash,
    jsonb_array_length(p_rows),
    'registered'
  )
  returning id into v_batch_id;

  for v_row in
    select value
    from jsonb_array_elements(p_rows)
  loop
    if exists (
      select 1
      from public.import_batch_rows r
      where r.owner_user_id = v_uid
        and r.account_id = p_account_id
        and r.identity_key = v_row ->> 'identity_key'
    ) then
      v_skipped_count := v_skipped_count + 1;
      v_skipped_rows := v_skipped_rows || jsonb_build_array(
        jsonb_build_object(
          'source_line', (v_row ->> 'source_line')::integer,
          'identity_key', v_row ->> 'identity_key'
        )
      );
      continue;
    end if;

    v_primary_tx_id := null;
    v_linked_tx_id := null;
    v_tx_index := 0;

    for v_tx in
      select value
      from jsonb_array_elements(coalesce(v_row -> 'transactions', '[]'::jsonb))
    loop
      v_tx_index := v_tx_index + 1;
      v_account_id := (v_tx ->> 'account_id')::uuid;
      v_tx_type := v_tx ->> 'type';
      v_amount := (v_tx ->> 'amount')::numeric;
      v_category_id := nullif(v_tx ->> 'category_id', '')::uuid;
      v_statement_cycle_id := nullif(v_tx ->> 'statement_cycle_id', '');
      v_statement_due_date := nullif(v_tx ->> 'statement_due_date', '')::date;
      v_invoice_payment_origin := nullif(v_tx ->> 'invoice_payment_origin', '');

      if v_tx_type not in ('income', 'expense') then
        raise exception 'Invalid transaction type';
      end if;

      if v_amount is null or v_amount <= 0 then
        raise exception 'Invalid transaction amount';
      end if;

      if v_invoice_payment_origin is not null
         and v_invoice_payment_origin not in ('manual', 'imported') then
        raise exception 'Invalid invoice_payment_origin';
      end if;

      if not public.can_post_to_account(v_account_id, v_uid) then
        raise exception 'Cannot post to account %', v_account_id
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
        family_id,
        statement_cycle_id,
        statement_due_date,
        invoice_payment_origin
      )
      values (
        v_tx ->> 'description',
        v_amount,
        v_tx_type,
        v_category_id,
        v_account_id,
        (v_tx ->> 'transaction_date')::date,
        v_uid,
        p_family_id,
        v_statement_cycle_id,
        v_statement_due_date,
        v_invoice_payment_origin
      )
      returning id into v_tx_id;

      if v_tx_type = 'income' then
        v_balance_delta := v_amount;
      else
        v_balance_delta := -v_amount;
      end if;

      update public.accounts
      set balance = balance + v_balance_delta
      where id = v_account_id;

      v_created_transactions := v_created_transactions + 1;

      if v_tx_index = 1 then
        v_primary_tx_id := v_tx_id;
      elsif v_tx_index = 2 then
        v_linked_tx_id := v_tx_id;
      end if;
    end loop;

    if v_primary_tx_id is null then
      raise exception 'Import row has no transactions';
    end if;

    insert into public.import_batch_rows (
      batch_id,
      owner_user_id,
      account_id,
      source,
      source_line,
      identity_key,
      external_fingerprint,
      external_id,
      kind,
      row_date,
      amount,
      direction,
      description,
      transaction_id,
      linked_transaction_id
    )
    values (
      v_batch_id,
      v_uid,
      p_account_id,
      p_source,
      (v_row ->> 'source_line')::integer,
      v_row ->> 'identity_key',
      v_row ->> 'external_fingerprint',
      nullif(v_row ->> 'external_id', ''),
      v_row ->> 'kind',
      (v_row ->> 'row_date')::date,
      (v_row ->> 'amount')::numeric,
      v_row ->> 'direction',
      v_row ->> 'description',
      v_primary_tx_id,
      v_linked_tx_id
    );

    v_created_batch_rows := v_created_batch_rows + 1;
  end loop;

  if v_created_batch_rows = 0 then
    delete from public.import_batches
    where id = v_batch_id;

    return jsonb_build_object(
      'batch_id', null,
      'committed_rows', 0,
      'created_transactions', 0,
      'skipped_count', v_skipped_count,
      'skipped_rows', v_skipped_rows
    );
  end if;

  update public.import_batches
  set
    status = 'committed',
    row_count = v_created_batch_rows
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'committed_rows', v_created_batch_rows,
    'created_transactions', v_created_transactions,
    'skipped_count', v_skipped_count,
    'skipped_rows', v_skipped_rows
  );
end;
$$;

grant execute on function public.commit_nubank_import(uuid, uuid, text, text, text, jsonb) to authenticated;

-- Replace 7-arg overload with due-aware signature.
drop function if exists public.create_credit_card_invoice_payment(
  uuid, uuid, numeric, date, text, text, text
);

-- Manual / UI invoice payment: dual-write closing + due.
create or replace function public.create_credit_card_invoice_payment(
  p_card_account_id uuid,
  p_source_account_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_statement_cycle_id text default null,
  p_notes text default null,
  p_origin text default 'manual',
  p_statement_due_date date default null
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
  v_due date := p_statement_due_date;
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

  -- If due omitted but closing is known, fill due from persisted cycle.
  if v_due is null and v_cycle is not null then
    select c.due_date into v_due
    from public.card_statement_cycles c
    where c.account_id = p_card_account_id
      and to_char(c.closing_date, 'YYYY-MM-DD') = v_cycle
    limit 1;
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
    statement_due_date,
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
    v_due,
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
    statement_due_date,
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
    v_due,
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
    'statementDueDate', v_due,
    'origin', v_origin
  );
end;
$$;

revoke all on function public.create_credit_card_invoice_payment(
  uuid, uuid, numeric, date, text, text, text, date
) from public;

grant execute on function public.create_credit_card_invoice_payment(
  uuid, uuid, numeric, date, text, text, text, date
) to authenticated;

comment on function public.create_credit_card_invoice_payment(
  uuid, uuid, numeric, date, text, text, text, date
) is
  'Registers a credit-card invoice payment linked by statement_due_date (preferred) and statement_cycle_id (legacy closing).';
