-- Stop orphan imported card_statement_cycles from poisoning reimports / Faturas.
--
-- Problem: rolling back (or deleting) an import can leave rows with
--   source = 'imported', import_batch_id = NULL, amount_due still set.
-- Faturas prefer issuer amount_due on imported cycles, so ghost totals stick
-- around and later imports merge against stale amounts.
--
-- Fix:
-- 1) Clear stale amount_due on existing orphans; delete orphans with no activity.
-- 2) On unlink (rollback or FK ON DELETE SET NULL), always clear amount_due.
-- 3) Rollback unlink clears amount_due explicitly (defense in depth).

-- ---------------------------------------------------------------------------
-- 1) One-shot cleanup
-- ---------------------------------------------------------------------------

-- Ghost issuer totals without a living import batch.
update public.card_statement_cycles
set
  amount_due = null,
  updated_at = timezone('utc', now())
where import_batch_id is null
  and source = 'imported'
  and amount_due is not null;

-- Empty orphans (no expenses in period, no payment links).
delete from public.card_statement_cycles c
where c.import_batch_id is null
  and c.source in ('imported', 'manual')
  and not exists (
    select 1
    from public.transactions t
    where t.account_id = c.account_id
      and t.type = 'expense'
      and t.transaction_date >= c.period_start
      and t.transaction_date <= c.period_end
  )
  and not exists (
    select 1
    from public.transactions t
    where t.account_id = c.account_id
      and (
        t.statement_cycle_id = to_char(c.closing_date, 'YYYY-MM-DD')
        or t.statement_due_date = c.due_date
      )
  );

-- ---------------------------------------------------------------------------
-- 2) Trigger: clearing import_batch_id always drops issuer amount_due
-- ---------------------------------------------------------------------------
create or replace function public.card_statement_cycles_on_batch_unlink()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.import_batch_id is not null and new.import_batch_id is null then
    new.amount_due := null;
    new.updated_at := timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists card_statement_cycles_batch_unlink_trg
  on public.card_statement_cycles;

create trigger card_statement_cycles_batch_unlink_trg
  before update of import_batch_id on public.card_statement_cycles
  for each row
  execute function public.card_statement_cycles_on_batch_unlink();

-- ---------------------------------------------------------------------------
-- 3) Harden rollback_import_batch unlink (clear amount_due with the unlink)
-- ---------------------------------------------------------------------------
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
  v_unlinked_cycles integer := 0;
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

  foreach v_id in array v_tx_ids
  loop
    if not public.can_edit_transaction(v_id, v_uid) then
      raise exception 'Not allowed to delete a transaction from this import'
        using errcode = '42501';
    end if;
  end loop;

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

  if cardinality(v_tx_ids) > 0 then
    update public.transactions
    set reconciled_with_transaction_id = null
    where reconciled_with_transaction_id = any (v_tx_ids)
       or id = any (v_tx_ids);

    update public.transactions
    set linked_transaction_id = null
    where id = any (v_tx_ids)
       or linked_transaction_id = any (v_tx_ids);
  end if;

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

  -- Keep the cycle only when other activity remains; drop issuer amount_due
  -- because that total belonged to the batch being rolled back.
  with unlinked as (
    update public.card_statement_cycles c
    set
      import_batch_id = null,
      amount_due = null,
      updated_at = timezone('utc', now())
    where c.import_batch_id = p_batch_id
      and (
        exists (
          select 1
          from public.transactions t
          where t.account_id = c.account_id
            and t.type = 'expense'
            and t.transaction_date >= c.period_start
            and t.transaction_date <= c.period_end
        )
        or exists (
          select 1
          from public.transactions t
          where t.account_id = c.account_id
            and (
              t.statement_cycle_id = to_char(c.closing_date, 'YYYY-MM-DD')
              or t.statement_due_date = c.due_date
            )
        )
      )
    returning c.id
  )
  select count(*)::integer into v_unlinked_cycles from unlinked;

  with deleted as (
    delete from public.card_statement_cycles
    where import_batch_id = p_batch_id
    returning id
  )
  select count(*)::integer into v_deleted_cycles from deleted;

  delete from public.import_batches
  where id = p_batch_id;

  return jsonb_build_object(
    'batchId', p_batch_id,
    'deletedTransactions', v_deleted_transactions,
    'deletedBatchRows', v_batch_row_count,
    'deletedCycles', v_deleted_cycles,
    'unlinkedCycles', v_unlinked_cycles,
    'invoicePaymentRows', v_invoice_payment_rows,
    'classificationMemoryRows', v_classification_memory_rows,
    'accountId', v_batch.account_id
  );
end;
$$;

revoke all on function public.rollback_import_batch(uuid) from public;
grant execute on function public.rollback_import_batch(uuid) to authenticated;

comment on function public.rollback_import_batch(uuid) is
  'Atomically undoes one import batch. Preserves category memory. Unlinks card_statement_cycles only when remaining activity exists and clears amount_due; deletes empty leftovers.';
