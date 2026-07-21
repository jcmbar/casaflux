-- Persist category classification learning so wiping transactions does not
-- erase prefix/merchant/description → category knowledge used by import suggestions.

create table if not exists public.category_classification_memory (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  family_id uuid references public.families (id) on delete set null,
  description text not null,
  normalized_description text not null,
  normalized_merchant text not null default '',
  strong_prefix text,
  transaction_type text not null
    check (transaction_type in ('income', 'expense')),
  category_id uuid not null references public.categories (id) on delete cascade,
  hit_count integer not null default 1 check (hit_count > 0),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.category_classification_memory is
  'Durable category-learning samples (description/merchant → category). Survives transaction cleanup.';

create unique index if not exists category_classification_memory_uidx
  on public.category_classification_memory (
    owner_user_id,
    normalized_description,
    transaction_type,
    category_id
  );

create index if not exists category_classification_memory_owner_idx
  on public.category_classification_memory (owner_user_id, last_seen_at desc);

create index if not exists category_classification_memory_merchant_idx
  on public.category_classification_memory (owner_user_id, normalized_merchant)
  where normalized_merchant <> '';

alter table public.category_classification_memory enable row level security;

drop policy if exists category_classification_memory_select_own
  on public.category_classification_memory;
create policy category_classification_memory_select_own
  on public.category_classification_memory
  for select to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists category_classification_memory_insert_own
  on public.category_classification_memory;
create policy category_classification_memory_insert_own
  on public.category_classification_memory
  for insert to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists category_classification_memory_update_own
  on public.category_classification_memory;
create policy category_classification_memory_update_own
  on public.category_classification_memory
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists category_classification_memory_delete_own
  on public.category_classification_memory;
create policy category_classification_memory_delete_own
  on public.category_classification_memory
  for delete to authenticated
  using (owner_user_id = auth.uid());

-- Snapshot learning from categorized transactions into durable memory.
-- Keeps categories / user_hidden_categories untouched.
create or replace function public.snapshot_category_classification_memory(
  p_account_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  if p_account_ids is null or cardinality(p_account_ids) = 0 then
    return 0;
  end if;

  with source as (
    select
      t.created_by as owner_user_id,
      t.family_id,
      t.description,
      lower(
        regexp_replace(
          translate(
            t.description,
            'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
            'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
          ),
          '\s+',
          ' ',
          'g'
        )
      ) as normalized_description,
      case
        when t.type in ('income', 'expense') then t.type
        else 'expense'
      end as transaction_type,
      t.category_id,
      count(*)::integer as hit_count,
      max(coalesce(t.transaction_date::timestamptz, t.created_at)) as last_seen_at
    from public.transactions t
    where t.account_id = any (p_account_ids)
      and t.category_id is not null
      and t.created_by is not null
      and nullif(btrim(t.description), '') is not null
    group by
      t.created_by,
      t.family_id,
      t.description,
      case
        when t.type in ('income', 'expense') then t.type
        else 'expense'
      end,
      t.category_id
  ),
  upserted as (
    insert into public.category_classification_memory (
      owner_user_id,
      family_id,
      description,
      normalized_description,
      normalized_merchant,
      strong_prefix,
      transaction_type,
      category_id,
      hit_count,
      last_seen_at
    )
    select
      s.owner_user_id,
      s.family_id,
      s.description,
      trim(s.normalized_description),
      '',
      null,
      s.transaction_type,
      s.category_id,
      s.hit_count,
      s.last_seen_at
    from source s
    where trim(s.normalized_description) <> ''
    on conflict (owner_user_id, normalized_description, transaction_type, category_id)
    do update set
      description = excluded.description,
      family_id = coalesce(excluded.family_id, category_classification_memory.family_id),
      hit_count = category_classification_memory.hit_count + excluded.hit_count,
      last_seen_at = greatest(
        category_classification_memory.last_seen_at,
        excluded.last_seen_at
      )
    returning 1
  )
  select count(*) into v_inserted from upserted;

  return coalesce(v_inserted, 0);
end;
$$;

revoke all on function public.snapshot_category_classification_memory(uuid[]) from public;
grant execute on function public.snapshot_category_classification_memory(uuid[]) to authenticated;

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
    -- Preserve classification learning before transactional deletes.
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
    'balancesReset', v_reset_balances,
    'classificationMemoryRows', v_classification_memory_rows,
    'familyIncluded', v_family_admin
  );
end;
$$;

revoke all on function public.cleanup_finance_data(text[], uuid) from public;
grant execute on function public.cleanup_finance_data(text[], uuid) to authenticated;

comment on function public.cleanup_finance_data(text[], uuid) is
  'Selectively deletes transactional financial data. Snapshots category classification memory before wiping transactions. Never deletes auth, profile, family graph, categories, user_hidden_categories, or category_classification_memory.';
