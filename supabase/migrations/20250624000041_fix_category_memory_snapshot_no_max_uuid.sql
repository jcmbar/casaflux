-- Repair snapshot after 00040: Postgres has no max(uuid). Prefer non-null
-- family_id with DISTINCT ON + (family_id is null) sort instead.

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

  with raw as (
    select
      t.created_by as owner_user_id,
      t.family_id,
      t.description,
      trim(
        both
        from lower(
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
        )
      ) as normalized_description,
      case
        when t.type in ('income', 'expense') then t.type
        else 'expense'
      end as transaction_type,
      t.category_id,
      coalesce(t.transaction_date::timestamptz, t.created_at) as seen_at
    from public.transactions t
    where t.account_id = any (p_account_ids)
      and t.category_id is not null
      and t.created_by is not null
      and nullif(btrim(t.description), '') is not null
  ),
  keyed as (
    select *
    from raw
    where normalized_description <> ''
  ),
  tallies as (
    select
      owner_user_id,
      normalized_description,
      transaction_type,
      category_id,
      count(*)::integer as hit_count,
      max(seen_at) as last_seen_at
    from keyed
    group by
      owner_user_id,
      normalized_description,
      transaction_type,
      category_id
  ),
  best as (
    select distinct on (
      owner_user_id,
      normalized_description,
      transaction_type,
      category_id
    )
      owner_user_id,
      family_id,
      description,
      normalized_description,
      transaction_type,
      category_id
    from keyed
    order by
      owner_user_id,
      normalized_description,
      transaction_type,
      category_id,
      (family_id is null) asc,
      seen_at desc,
      description asc
  ),
  source as (
    select
      b.owner_user_id,
      b.family_id,
      b.description,
      b.normalized_description,
      b.transaction_type,
      b.category_id,
      t.hit_count,
      t.last_seen_at
    from best b
    join tallies t
      on t.owner_user_id = b.owner_user_id
      and t.normalized_description = b.normalized_description
      and t.transaction_type = b.transaction_type
      and t.category_id = b.category_id
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
      s.normalized_description,
      '',
      null,
      s.transaction_type,
      s.category_id,
      s.hit_count,
      s.last_seen_at
    from source s
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

comment on function public.snapshot_category_classification_memory(uuid[]) is
  'Snapshots categorized transactions into category_classification_memory. Dedupes by unique conflict key via DISTINCT ON (no max(uuid)).';
