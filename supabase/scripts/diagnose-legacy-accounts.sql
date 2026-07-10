-- Diagnose accounts that violate the ownership model.
-- Run after migration 20250624000002 and before 202506240000025:
--   npx supabase db query --linked -f supabase/scripts/diagnose-legacy-accounts.sql

select
  a.id,
  a.name,
  a.type,
  a.balance,
  a.owner_user_id,
  a.family_id,
  a.is_family_shared,
  a.allow_family_view,
  a.allow_family_post,
  a.allow_family_edit,
  a.created_at,
  case
    when a.is_family_shared = false
      and a.owner_user_id is not null
      and a.family_id is null then 'valid_personal'
    when a.is_family_shared = true
      and a.family_id is not null
      and a.owner_user_id is null then 'valid_family'
    when a.is_family_shared = false
      and a.owner_user_id is null
      and a.family_id is null then 'legacy_orphan_personal'
    when a.is_family_shared = false
      and a.owner_user_id is not null
      and a.family_id is not null then 'ambiguous_personal_with_family'
    when a.is_family_shared = true
      and a.family_id is null then 'invalid_family_missing_family_id'
    when a.is_family_shared = true
      and a.owner_user_id is not null then 'ambiguous_family_with_owner'
    when a.is_family_shared = false
      and a.owner_user_id is null
      and a.family_id is not null then 'ambiguous_personal_flag_with_family_id'
    else 'other_invalid'
  end as diagnosis
from public.accounts a
order by a.created_at;

select
  diagnosis,
  count(*) as total
from (
  select
    case
      when a.is_family_shared = false
        and a.owner_user_id is not null
        and a.family_id is null then 'valid_personal'
      when a.is_family_shared = true
        and a.family_id is not null
        and a.owner_user_id is null then 'valid_family'
      when a.is_family_shared = false
        and a.owner_user_id is null
        and a.family_id is null then 'legacy_orphan_personal'
      when a.is_family_shared = false
        and a.owner_user_id is not null
        and a.family_id is not null then 'ambiguous_personal_with_family'
      when a.is_family_shared = true
        and a.family_id is null then 'invalid_family_missing_family_id'
      when a.is_family_shared = true
        and a.owner_user_id is not null then 'ambiguous_family_with_owner'
      when a.is_family_shared = false
        and a.owner_user_id is null
        and a.family_id is not null then 'ambiguous_personal_flag_with_family_id'
      else 'other_invalid'
    end as diagnosis
  from public.accounts a
) s
group by diagnosis
order by total desc, diagnosis;
