# CasaFlux — Supabase migrations

Apply these SQL files in order on your Supabase project (SQL Editor or Supabase CLI).

## Files

1. `20250624000001_profiles_and_families.sql` — profiles, families, members, invitations
2. `20250624000002_alter_accounts_transactions.sql` — multi-user columns on accounts/transactions (sem constraint)
3. `20250624000003_helper_functions.sql` — permission helpers + slug generator
4. `20250624000004_triggers_profiles.sql` — auto profile on signup + email sync
5. `20250624000005_rls_policies.sql` — Row Level Security policies
6. `20250624000006_grants.sql` — execute grants for authenticated role
7. `20250624000007_sanitize_legacy_accounts.sql` — saneamento de dados legados + `accounts_ownership_check`
8. `20250624000008_family_invitations_flow.sql` — RPCs de convite + policy de profiles entre membros
9. `20250624000009_families_select_creator.sql` — select creator policy
10. `20250624000010_family_members_profiles_fk.sql` — FK family_members → profiles
11. `20250624000011_budgets_and_goals.sql` — orçamento mensal por categoria + metas financeiras
12. `20250624000012_remove_dev_bypass_policies.sql` — remove políticas dev full access
13. `20250624000013_goal_account_link.sql` — metas vinculadas a contas
14. `20250624000014_personal_categories.sql` — categorias personalizadas (`owner_user_id`) + RLS de CRUD
15. `20250624000015_category_lifecycle.sql` — `is_active`, `user_hidden_categories`, anti-delete de padrões

## Legacy accounts (important)

If migration 007 fails, assign owners manually before re-running push:

```bash
# 1) Discover your user id
npx supabase db query --linked "select id, email from auth.users order by created_at;"

# 2) Edit and run
npx supabase db query --linked -f supabase/scripts/assign-legacy-account-owners.sql

# 3) Re-apply pending migration
npx supabase db push
```

Diagnose invalid rows anytime:

```bash
npx supabase db query --linked -f supabase/scripts/diagnose-legacy-accounts.sql
```

## Manual Supabase dashboard steps

1. **Authentication → URL Configuration**
   - Site URL: your app origin (e.g. `http://localhost:3000`)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and production equivalent

2. **Authentication → Email templates** (optional)
   - Customize recovery email copy in Portuguese

3. **Existing data migration**
   - Legacy rows in `accounts` without `owner_user_id` will not be visible after RLS
   - Assign ownership manually or delete test data before enabling RLS

4. **Email confirmation**
   - For local dev, disable email confirmation or use Supabase Inbucket
   - Production: configure SMTP provider

## Notes

- `transactions.date` is renamed to `transaction_date` when present
- Family accounts require `is_family_shared = true`, `family_id` set, `owner_user_id` null
- Personal accounts require `owner_user_id = auth.uid()`, `is_family_shared = false`
