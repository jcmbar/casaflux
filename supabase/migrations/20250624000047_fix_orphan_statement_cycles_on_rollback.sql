-- Fix orphan card_statement_cycles left after credit-card import rollback.
--
-- Bug (000045): cycles with amount_due were UNLINKED instead of deleted even when
-- the rolled-back batch removed every remaining transaction for that invoice.
-- Result: /faturas kept showing "Importada" invoices with issuer totals and no
-- active import_batches / transactions.
--
-- Correct rule: unlink only when remaining activity still exists on the card for
-- that cycle; otherwise delete (including trusted amount_due from this import).
--
-- Also: wipe statement cycles when cleanup_finance_data clears account transactions,
-- and remove already-orphaned imported cycles with no remaining activity.

-- ---------------------------------------------------------------------------
-- 1) One-shot cleanup of residual orphans
-- ---------------------------------------------------------------------------
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
-- 2) Fix rollback_import_batch
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

  -- Unlink only when activity remains after this batch's deletes.
  -- amount_due alone is NOT enough — that metadata came from the import itself.
  with unlinked as (
    update public.card_statement_cycles c
    set
      import_batch_id = null,
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
  'Atomically undoes one import batch. Preserves category memory. Unlinks card_statement_cycles only when remaining activity exists; deletes empty leftovers (including issuer amount_due with no remaining txs).';

-- ---------------------------------------------------------------------------
-- 3) cleanup_finance_data: also wipe statement cycles when clearing transactions
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_finance_data(
  p_blocks text[],
  p_family_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_blocks text[] := coalesce(p_blocks, array[]::text[]);
  v_do_transactions boolean := false;
  v_do_accounts boolean := false;
  v_do_goals boolean := false;
  v_do_budgets boolean := false;
  v_family_admin boolean := false;
  v_account_ids uuid[] := array[]::uuid[];
  v_deleted_transactions integer := 0;
  v_deleted_predictions integer := 0;
  v_deleted_recurrences integer := 0;
  v_deleted_accounts integer := 0;
  v_deleted_goals integer := 0;
  v_deleted_budgets integer := 0;
  v_deleted_import_batches integer := 0;
  v_deleted_statement_cycles integer := 0;
  v_reset_balances integer := 0;
  v_classification_memory_rows integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if cardinality(v_blocks) = 0 then
    raise exception 'Select at least one cleanup block';
  end if;

  if exists (
    select 1
    from unnest(v_blocks) as block(value)
    where value not in ('transactions', 'accounts', 'goals', 'budgets', 'all')
  ) then
    raise exception 'Invalid cleanup block';
  end if;

  if p_family_id is not null then
    if not public.is_family_member(p_family_id, v_uid) then
      raise exception 'Not a member of this family'
        using errcode = '42501';
    end if;

    v_family_admin := public.is_family_admin(p_family_id, v_uid);
  end if;

  if 'all' = any (v_blocks) then
    v_do_transactions := true;
    v_do_accounts := true;
    v_do_goals := true;
    v_do_budgets := true;
  else
    v_do_transactions := 'transactions' = any (v_blocks);
    v_do_accounts := 'accounts' = any (v_blocks);
    v_do_goals := 'goals' = any (v_blocks);
    v_do_budgets := 'budgets' = any (v_blocks);
  end if;

  select coalesce(array_agg(a.id), array[]::uuid[])
  into v_account_ids
  from public.accounts a
  where (
      a.is_family_shared = false
      and a.owner_user_id = v_uid
    )
    or (
      v_family_admin
      and a.is_family_shared = true
      and a.family_id = p_family_id
    );

  if v_do_goals then
    with deleted as (
      delete from public.financial_goals g
      where g.owner_user_id = v_uid
         or (
           v_family_admin
           and g.family_id = p_family_id
         )
      returning 1
    )
    select count(*) into v_deleted_goals from deleted;
  elsif v_do_accounts then
    update public.financial_goals g
    set
      progress_mode = 'manual',
      account_id = null
    where g.account_id = any (v_account_ids)
      and (
        g.owner_user_id = v_uid
        or (
          v_family_admin
          and g.family_id = p_family_id
        )
      );
  end if;

  if v_do_budgets then
    with deleted as (
      delete from public.category_budgets b
      where b.owner_user_id = v_uid
         or (
           v_family_admin
           and b.family_id = p_family_id
         )
      returning 1
    )
    select count(*) into v_deleted_budgets from deleted;
  end if;

  if v_do_transactions or v_do_accounts then
    if cardinality(v_account_ids) > 0 then
      v_classification_memory_rows :=
        public.snapshot_category_classification_memory(v_account_ids);
    end if;

    with deleted as (
      delete from public.financial_predictions p
      where (
          p.owner_user_id = v_uid
          and (
            p.family_id is null
            or not exists (
              select 1
              from public.accounts a
              where a.id = p.account_id
                and a.is_family_shared = true
            )
          )
        )
        or (
          v_family_admin
          and p.family_id = p_family_id
        )
        or (
          cardinality(v_account_ids) > 0
          and p.account_id = any (v_account_ids)
        )
      returning 1
    )
    select count(*) into v_deleted_predictions from deleted;

    with deleted as (
      delete from public.transaction_recurrences r
      where r.owner_user_id = v_uid
         or (
           cardinality(v_account_ids) > 0
           and r.account_id = any (v_account_ids)
         )
      returning 1
    )
    select count(*) into v_deleted_recurrences from deleted;

    if cardinality(v_account_ids) > 0 then
      with deleted as (
        delete from public.import_batches b
        where b.account_id = any (v_account_ids)
        returning 1
      )
      select count(*) into v_deleted_import_batches from deleted;
    end if;
  end if;

  if v_do_transactions and not v_do_accounts then
    if cardinality(v_account_ids) > 0 then
      with deleted as (
        delete from public.transactions t
        where t.account_id = any (v_account_ids)
        returning 1
      )
      select count(*) into v_deleted_transactions from deleted;

      with deleted as (
        delete from public.card_statement_cycles c
        where c.account_id = any (v_account_ids)
        returning 1
      )
      select count(*) into v_deleted_statement_cycles from deleted;

      with updated as (
        update public.accounts a
        set balance = 0
        where a.id = any (v_account_ids)
        returning 1
      )
      select count(*) into v_reset_balances from updated;
    end if;
  end if;

  if v_do_accounts then
    if cardinality(v_account_ids) > 0 then
      with deleted_txs as (
        delete from public.transactions t
        where t.account_id = any (v_account_ids)
        returning 1
      )
      select count(*) into v_deleted_transactions from deleted_txs;

      with deleted as (
        delete from public.accounts a
        where a.id = any (v_account_ids)
        returning 1
      )
      select count(*) into v_deleted_accounts from deleted;
    end if;
  end if;

  return jsonb_build_object(
    'transactions', v_deleted_transactions,
    'predictions', v_deleted_predictions,
    'recurrences', v_deleted_recurrences,
    'accounts', v_deleted_accounts,
    'goals', v_deleted_goals,
    'budgets', v_deleted_budgets,
    'importBatches', v_deleted_import_batches,
    'statementCycles', v_deleted_statement_cycles,
    'balancesReset', v_reset_balances,
    'classificationMemoryRows', v_classification_memory_rows,
    'familyIncluded', v_family_admin
  );
end;
$$;

revoke all on function public.cleanup_finance_data(text[], uuid) from public;
grant execute on function public.cleanup_finance_data(text[], uuid) to authenticated;

comment on function public.cleanup_finance_data(text[], uuid) is
  'Selectively deletes transactional financial data. Snapshots category classification memory before wiping transactions. Also deletes card_statement_cycles when clearing account transactions. Never deletes auth, profile, family graph, categories, user_hidden_categories, or category_classification_memory.';
