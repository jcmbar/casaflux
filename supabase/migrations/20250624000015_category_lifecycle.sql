-- Category lifecycle: personal is_active + per-user hidden system categories

alter table public.categories
  add column if not exists is_active boolean not null default true;

create table if not exists public.user_hidden_categories (
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

create index if not exists idx_user_hidden_categories_user_id
  on public.user_hidden_categories (user_id);

alter table public.user_hidden_categories enable row level security;

drop policy if exists user_hidden_categories_select_own on public.user_hidden_categories;
create policy user_hidden_categories_select_own on public.user_hidden_categories
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_hidden_categories_insert_own on public.user_hidden_categories;
create policy user_hidden_categories_insert_own on public.user_hidden_categories
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_hidden_categories_delete_own on public.user_hidden_categories;
create policy user_hidden_categories_delete_own on public.user_hidden_categories
  for delete to authenticated
  using (user_id = auth.uid());

-- Personal categories: allow toggling is_active on update
drop policy if exists categories_update_own on public.categories;
create policy categories_update_own on public.categories
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Prevent deleting system categories at the database level
create or replace function public.prevent_system_category_delete()
returns trigger
language plpgsql
as $$
begin
  if old.owner_user_id is null then
    raise exception 'System categories cannot be deleted';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_prevent_system_category_delete on public.categories;
create trigger trg_prevent_system_category_delete
before delete on public.categories
for each row
execute function public.prevent_system_category_delete();
