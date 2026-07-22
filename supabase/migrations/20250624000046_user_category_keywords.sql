-- Per-user keyword overrides for category recognition during import.
-- Works for system (shared) and personal categories without mutating
-- the shared categories row.

create table if not exists public.user_category_keywords (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  keywords text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_user_id, category_id)
);

comment on table public.user_category_keywords is
  'User-authored recognition keywords per category (system or personal). Complements category_classification_memory.';

create index if not exists user_category_keywords_owner_idx
  on public.user_category_keywords (owner_user_id);

alter table public.user_category_keywords enable row level security;

drop policy if exists user_category_keywords_select_own
  on public.user_category_keywords;
create policy user_category_keywords_select_own
  on public.user_category_keywords
  for select
  using (owner_user_id = auth.uid());

drop policy if exists user_category_keywords_insert_own
  on public.user_category_keywords;
create policy user_category_keywords_insert_own
  on public.user_category_keywords
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists user_category_keywords_update_own
  on public.user_category_keywords;
create policy user_category_keywords_update_own
  on public.user_category_keywords
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists user_category_keywords_delete_own
  on public.user_category_keywords;
create policy user_category_keywords_delete_own
  on public.user_category_keywords
  for delete
  using (owner_user_id = auth.uid());
