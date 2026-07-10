-- Categories catalog (if not already present), monthly budgets and financial goals

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'expense' check (type in ('income', 'expense', 'transfer')),
  color text,
  icon text,
  created_at timestamptz not null default now()
);

create table if not exists public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  amount_limit numeric(12, 2) not null check (amount_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_budgets_scope_check check (
    (
      family_id is not null
      and owner_user_id is null
    )
    or (
      family_id is null
      and owner_user_id is not null
    )
  )
);

create unique index if not exists category_budgets_family_unique
  on public.category_budgets (family_id, category_id, month_key)
  where family_id is not null;

create unique index if not exists category_budgets_personal_unique
  on public.category_budgets (owner_user_id, category_id, month_key)
  where owner_user_id is not null;

create index if not exists idx_category_budgets_month_key
  on public.category_budgets (month_key);

create table if not exists public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  target_amount numeric(12, 2) not null check (target_amount > 0),
  current_amount numeric(12, 2) not null default 0 check (current_amount >= 0),
  deadline date,
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_goals_scope_check check (
    (
      family_id is not null
      and owner_user_id is null
    )
    or (
      family_id is null
      and owner_user_id is not null
    )
  )
);

create index if not exists idx_financial_goals_family_id
  on public.financial_goals (family_id);

create index if not exists idx_financial_goals_owner_user_id
  on public.financial_goals (owner_user_id);

-- RLS
alter table public.category_budgets enable row level security;
alter table public.financial_goals enable row level security;

drop policy if exists category_budgets_select on public.category_budgets;
create policy category_budgets_select on public.category_budgets
  for select to authenticated
  using (
    (
      family_id is not null
      and public.is_family_member(family_id, auth.uid())
    )
    or owner_user_id = auth.uid()
  );

drop policy if exists category_budgets_insert on public.category_budgets;
create policy category_budgets_insert on public.category_budgets
  for insert to authenticated
  with check (
    (
      family_id is not null
      and public.is_family_admin(family_id, auth.uid())
    )
    or owner_user_id = auth.uid()
  );

drop policy if exists category_budgets_update on public.category_budgets;
create policy category_budgets_update on public.category_budgets
  for update to authenticated
  using (
    (
      family_id is not null
      and public.is_family_admin(family_id, auth.uid())
    )
    or owner_user_id = auth.uid()
  )
  with check (
    (
      family_id is not null
      and public.is_family_admin(family_id, auth.uid())
    )
    or owner_user_id = auth.uid()
  );

drop policy if exists category_budgets_delete on public.category_budgets;
create policy category_budgets_delete on public.category_budgets
  for delete to authenticated
  using (
    (
      family_id is not null
      and public.is_family_admin(family_id, auth.uid())
    )
    or owner_user_id = auth.uid()
  );

drop policy if exists financial_goals_select on public.financial_goals;
create policy financial_goals_select on public.financial_goals
  for select to authenticated
  using (
    (
      family_id is not null
      and public.is_family_member(family_id, auth.uid())
    )
    or owner_user_id = auth.uid()
  );

drop policy if exists financial_goals_insert on public.financial_goals;
create policy financial_goals_insert on public.financial_goals
  for insert to authenticated
  with check (
    (
      family_id is not null
      and public.is_family_member(family_id, auth.uid())
    )
    or owner_user_id = auth.uid()
  );

drop policy if exists financial_goals_update on public.financial_goals;
create policy financial_goals_update on public.financial_goals
  for update to authenticated
  using (
    (
      family_id is not null
      and public.is_family_member(family_id, auth.uid())
    )
    or owner_user_id = auth.uid()
  )
  with check (
    (
      family_id is not null
      and public.is_family_member(family_id, auth.uid())
    )
    or owner_user_id = auth.uid()
  );

drop policy if exists financial_goals_delete on public.financial_goals;
create policy financial_goals_delete on public.financial_goals
  for delete to authenticated
  using (
    (
      family_id is not null
      and public.is_family_admin(family_id, auth.uid())
    )
    or owner_user_id = auth.uid()
  );
