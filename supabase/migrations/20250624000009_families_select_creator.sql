-- Allow family creators to read their family before membership exists.
-- Fixes onboarding insert().select().single() and family_members insert WITH CHECK subquery.

drop policy if exists families_select_creator on public.families;

create policy families_select_creator on public.families
  for select to authenticated
  using (created_by = auth.uid());
