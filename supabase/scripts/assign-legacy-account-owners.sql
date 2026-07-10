-- Manual ownership assignment for legacy personal accounts.
-- 1) Discover your user id:
--    npx supabase db query --linked "select id, email from auth.users order by created_at;"
-- 2) Replace <YOUR_USER_UUID> below.
-- 3) Run:
--    npx supabase db query --linked -f supabase/scripts/assign-legacy-account-owners.sql
-- 4) Re-run migrations:
--    npx supabase db push

update public.accounts
set
  owner_user_id = '<YOUR_USER_UUID>',
  family_id = null,
  is_family_shared = false,
  allow_family_view = false,
  allow_family_post = false,
  allow_family_edit = false
where id in (
  '9dd3fb29-2fc4-4078-a1f6-2c80e63afd0b', -- Conta Corrente
  'ceebe7ee-27ec-449f-a986-d92a16fc2bb9', -- Cartão de Crédito
  '80a75969-3bbc-4c2e-9d3c-4e10f05df349'  -- Nubank
)
and owner_user_id is null
and family_id is null
and is_family_shared = false;
