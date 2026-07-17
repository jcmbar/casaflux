-- Selective financial data cleanup for authenticated users.
-- Never touches auth, profiles, families, memberships, invitations, or categories.

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
  v_reset_balances integer := 0;
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

  -- Goals (standalone block, or before accounts when banks are wiped).
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
    -- Keep goals, but unlink account_balance goals that would break on SET NULL.
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
    'balancesReset', v_reset_balances,
    'familyIncluded', v_family_admin
  );
end;
$$;

revoke all on function public.cleanup_finance_data(text[], uuid) from public;
grant execute on function public.cleanup_finance_data(text[], uuid) to authenticated;

comment on function public.cleanup_finance_data(text[], uuid) is
  'Selectively deletes the caller''s financial data (and active-family shared data when admin). Never deletes auth, profile, family graph, or categories.';
