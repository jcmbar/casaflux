-- Preserve category classification learning when rolling back an import batch.
-- Learning lives primarily on transactions.category_id; without a snapshot into
-- category_classification_memory, deleting the batch erased suggestions on reimport.

create or replace function public.rollback_import_batch(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_batch public.import_batches%rowtype;
  v_tx_ids uuid[] := array[]::uuid[];
  v_account_ids uuid[] := array[]::uuid[];
  v_tx public.transactions%rowtype;
  v_balance_delta numeric(14, 2);
  v_deleted_transactions integer := 0;
  v_deleted_cycles integer := 0;
  v_batch_row_count integer := 0;
  v_invoice_payment_rows integer := 0;
  v_classification_memory_rows integer := 0;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_batch_id is null then
    raise exception 'Batch id is required';
  end if;

  select * into v_batch
  from public.import_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Import batch not found';
  end if;

  if v_batch.owner_user_id is distinct from v_uid then
    raise exception 'Not allowed to rollback this import'
      using errcode = '42501';
  end if;

  if not public.can_post_to_account(v_batch.account_id, v_uid) then
    raise exception 'Cannot edit target account'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into v_batch_row_count
  from public.import_batch_rows
  where batch_id = p_batch_id;

  select count(*)::integer
  into v_invoice_payment_rows
  from public.import_batch_rows
  where batch_id = p_batch_id
    and kind = 'card_invoice_payment';

  -- Collect every transaction created by this batch (primary + linked twins).
  select coalesce(array_agg(distinct tx_id), array[]::uuid[])
  into v_tx_ids
  from (
    select transaction_id as tx_id
    from public.import_batch_rows
    where batch_id = p_batch_id
      and transaction_id is not null
    union
    select linked_transaction_id as tx_id
    from public.import_batch_rows
    where batch_id = p_batch_id
      and linked_transaction_id is not null
  ) ids;

  -- Permission check before mutating.
  foreach v_id in array v_tx_ids
  loop
    if not public.can_edit_transaction(v_id, v_uid) then
      raise exception 'Not allowed to delete a transaction from this import'
        using errcode = '42501';
    end if;
  end loop;

  -- Snapshot description→category learning BEFORE deleting transactions so
  -- reimport can still suggest categories (same guarantee as cleanup_finance_data).
  select coalesce(array_agg(distinct account_id), array[v_batch.account_id])
  into v_account_ids
  from (
    select v_batch.account_id as account_id
    union
    select t.account_id
    from public.transactions t
    where cardinality(v_tx_ids) > 0
      and t.id = any (v_tx_ids)
  ) accounts;

  if cardinality(v_account_ids) > 0 then
    v_classification_memory_rows :=
      public.snapshot_category_classification_memory(v_account_ids);
  end if;

  -- Clear reconcile links pointing at (or from) imported transactions.
  if cardinality(v_tx_ids) > 0 then
    update public.transactions
    set reconciled_with_transaction_id = null
    where reconciled_with_transaction_id = any (v_tx_ids)
       or id = any (v_tx_ids);

    -- Detach linked twins so deletes do not leave dangling FKs.
    update public.transactions
    set linked_transaction_id = null
    where id = any (v_tx_ids)
       or linked_transaction_id = any (v_tx_ids);
  end if;

  -- Reverse balances and delete transactions.
  foreach v_id in array v_tx_ids
  loop
    select * into v_tx
    from public.transactions
    where id = v_id
    for update;

    if not found then
      continue;
    end if;

    if not public.can_post_to_account(v_tx.account_id, v_uid) then
      raise exception 'Cannot edit account for imported transaction'
        using errcode = '42501';
    end if;

    perform 1 from public.accounts where id = v_tx.account_id for update;

    if v_tx.type = 'income' then
      v_balance_delta := -round(v_tx.amount::numeric, 2);
    elsif v_tx.type = 'expense' then
      v_balance_delta := round(v_tx.amount::numeric, 2);
    elsif v_tx.type = 'transfer' then
      raise exception 'Import batch contains a transfer and cannot be rolled back safely';
    else
      raise exception 'Unsupported transaction type in import rollback';
    end if;

    update public.accounts
    set balance = balance + v_balance_delta
    where id = v_tx.account_id;

    delete from public.transactions
    where id = v_tx.id;

    v_deleted_transactions := v_deleted_transactions + 1;
  end loop;

  -- Remove issuer cycles captured for this batch (do not leave orphaned amounts).
  with deleted as (
    delete from public.card_statement_cycles
    where import_batch_id = p_batch_id
    returning id
  )
  select count(*)::integer into v_deleted_cycles from deleted;

  -- Deleting the batch cascades import_batch_rows (frees identity_key + content_hash).
  delete from public.import_batches
  where id = p_batch_id;

  return jsonb_build_object(
    'batchId', p_batch_id,
    'deletedTransactions', v_deleted_transactions,
    'deletedBatchRows', v_batch_row_count,
    'deletedCycles', v_deleted_cycles,
    'invoicePaymentRows', v_invoice_payment_rows,
    'classificationMemoryRows', v_classification_memory_rows,
    'accountId', v_batch.account_id
  );
end;
$$;

revoke all on function public.rollback_import_batch(uuid) from public;
grant execute on function public.rollback_import_batch(uuid) to authenticated;

comment on function public.rollback_import_batch(uuid) is
  'Atomically undoes one import batch (balances, txs, cycles, batch rows) while preserving category_classification_memory via snapshot before deletes.';
