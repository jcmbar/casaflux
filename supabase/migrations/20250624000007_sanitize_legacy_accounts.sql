-- Sanitize legacy accounts and enforce accounts_ownership_check.
-- Runs after core schema/RLS migrations. Safe normalization only.

-- 1) Explicit defaults for pre-multiuser rows (personal, unassigned).
update public.accounts
set
  is_family_shared = false,
  allow_family_view = false,
  allow_family_post = false,
  allow_family_edit = false,
  family_id = null
where owner_user_id is null
  and family_id is null
  and is_family_shared = false;

-- 2) Fail with a clear report if any row is still invalid.
do $$
declare
  invalid_count integer;
  invalid_report text := '';
  r record;
begin
  select count(*)
  into invalid_count
  from public.accounts a
  where not (
    (
      a.is_family_shared = false
      and a.owner_user_id is not null
      and a.family_id is null
    )
    or (
      a.is_family_shared = true
      and a.family_id is not null
      and a.owner_user_id is null
    )
  );

  if invalid_count = 0 then
    return;
  end if;

  for r in
    select
      a.id,
      a.name,
      a.type,
      a.owner_user_id,
      a.family_id,
      a.is_family_shared,
      a.created_at,
      case
        when a.is_family_shared = false
          and a.owner_user_id is null
          and a.family_id is null then 'legacy_orphan_personal'
        when a.is_family_shared = false
          and a.owner_user_id is not null
          and a.family_id is not null then 'ambiguous_personal_with_family'
        when a.is_family_shared = true
          and a.family_id is null then 'invalid_family_missing_family_id'
        when a.is_family_shared = true
          and a.owner_user_id is not null
          and a.family_id is not null then 'ambiguous_family_with_owner'
        when a.is_family_shared = false
          and a.owner_user_id is null
          and a.family_id is not null then 'ambiguous_personal_flag_with_family_id'
        when a.is_family_shared = true
          and a.owner_user_id is null
          and a.family_id is null then 'invalid_family_missing_family_id'
        else 'other_invalid'
      end as diagnosis
    from public.accounts a
    where not (
      (
        a.is_family_shared = false
        and a.owner_user_id is not null
        and a.family_id is null
      )
      or (
        a.is_family_shared = true
        and a.family_id is not null
        and a.owner_user_id is null
      )
    )
    order by a.created_at
  loop
    invalid_report := invalid_report || format(
      E'\n- id=%s | name=%s | type=%s | owner_user_id=%s | family_id=%s | is_family_shared=%s | diagnosis=%s | created_at=%s',
      r.id,
      r.name,
      r.type,
      coalesce(r.owner_user_id::text, 'NULL'),
      coalesce(r.family_id::text, 'NULL'),
      r.is_family_shared,
      r.diagnosis,
      r.created_at
    );
  end loop;

  raise exception
    'Legacy accounts require manual ownership assignment before constraint (% invalid row(s)): %',
    invalid_count,
    invalid_report
    using hint = 'Run supabase/scripts/assign-legacy-account-owners.sql after setting the correct auth.users.id, then re-run supabase db push.';
end;
$$;

-- 3) Enforce ownership model once data is valid.
alter table public.accounts drop constraint if exists accounts_ownership_check;

alter table public.accounts
  add constraint accounts_ownership_check check (
    (
      is_family_shared = false
      and owner_user_id is not null
      and family_id is null
    )
    or (
      is_family_shared = true
      and family_id is not null
      and owner_user_id is null
    )
  );
