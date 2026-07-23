-- Allow C6 Bank checking CSV imports alongside existing sources.

alter table public.import_batches
  drop constraint if exists import_batches_source_check;

alter table public.import_batches
  add constraint import_batches_source_check
  check (source in (
    'nubank_checking',
    'nubank_credit_card',
    'inter_checking',
    'bradesco_checking',
    'c6_checking'
  ));

alter table public.import_batch_rows
  drop constraint if exists import_batch_rows_source_check;

alter table public.import_batch_rows
  add constraint import_batch_rows_source_check
  check (source in (
    'nubank_checking',
    'nubank_credit_card',
    'inter_checking',
    'bradesco_checking',
    'c6_checking'
  ));

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

  if p_source not in (
    'nubank_checking',
    'nubank_credit_card',
    'inter_checking',
    'bradesco_checking',
    'c6_checking'
  ) then
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
