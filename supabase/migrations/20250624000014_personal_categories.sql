-- Personal custom categories: system defaults (owner null) + user-owned rows

alter table public.categories
  add column if not exists owner_user_id uuid references auth.users (id) on delete cascade;

create index if not exists idx_categories_owner_user_id
  on public.categories (owner_user_id)
  where owner_user_id is not null;

drop policy if exists categories_select_authenticated on public.categories;
create policy categories_select_authenticated on public.categories
  for select to authenticated
  using (owner_user_id is null or owner_user_id = auth.uid());

drop policy if exists categories_insert_own on public.categories;
create policy categories_insert_own on public.categories
  for insert to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists categories_update_own on public.categories;
create policy categories_update_own on public.categories
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists categories_delete_own on public.categories;
create policy categories_delete_own on public.categories
  for delete to authenticated
  using (owner_user_id = auth.uid());
