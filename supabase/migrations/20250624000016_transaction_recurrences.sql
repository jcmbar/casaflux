-- Recurring transactions: recurrence templates + predicted occurrences
-- Project convention: text + check constraints instead of native enums
-- (see categories.type, financial_goals.status).

-- ============================================================
-- transaction_recurrences: the recurrence template
-- ============================================================

create table if not exists public.transaction_recurrences (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families (id) on delete set null,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  type text not null check (type in ('expense', 'income', 'transfer')),
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'yearly')),
  start_date date not null,
  end_type text not null default 'never' check (end_type in ('never', 'until_date', 'occurrences_count')),
  end_date date,
  occurrences_limit integer,
  auto_confirm boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_recurrences_end_config_check check (
    (
      end_type = 'never'
      and end_date is null
      and occurrences_limit is null
    )
    or (
      end_type = 'until_date'
      and end_date is not null
      and occurrences_limit is null
    )
    or (
      end_type = 'occurrences_count'
      and occurrences_limit is not null
      and occurrences_limit > 0
      and end_date is null
    )
  ),
  constraint transaction_recurrences_end_date_check check (
    end_date is null or end_date >= start_date
  )
);

create index if not exists idx_transaction_recurrences_account_id
  on public.transaction_recurrences (account_id);

create index if not exists idx_transaction_recurrences_owner_user_id
  on public.transaction_recurrences (owner_user_id);

create index if not exists idx_transaction_recurrences_family_id
  on public.transaction_recurrences (family_id);

create index if not exists idx_transaction_recurrences_active
  on public.transaction_recurrences (is_active)
  where is_active = true;

-- Keep family_id in sync with the account (same pattern as transactions)
create or replace function public.sync_recurrence_family_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  select a.family_id
  into v_family_id
  from public.accounts a
  where a.id = new.account_id;

  new.family_id := v_family_id;
  return new;
end;
$$;

drop trigger if exists trg_sync_recurrence_family_id on public.transaction_recurrences;

create trigger trg_sync_recurrence_family_id
before insert or update of account_id on public.transaction_recurrences
for each row
execute function public.sync_recurrence_family_id();

-- ============================================================
-- transaction_recurrence_occurrences: generated occurrences
-- ============================================================

create table if not exists public.transaction_recurrence_occurrences (
  id uuid primary key default gen_random_uuid(),
  recurrence_id uuid not null references public.transaction_recurrences (id) on delete cascade,
  scheduled_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'predicted' check (status in ('predicted', 'confirmed', 'skipped')),
  source_transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only confirmed occurrences may point to a real transaction
  constraint recurrence_occurrences_source_check check (
    source_transaction_id is null or status = 'confirmed'
  )
);

-- One occurrence per recurrence per date (idempotent generation)
create unique index if not exists recurrence_occurrences_unique_date
  on public.transaction_recurrence_occurrences (recurrence_id, scheduled_date);

-- A real transaction can back at most one occurrence
create unique index if not exists recurrence_occurrences_unique_source
  on public.transaction_recurrence_occurrences (source_transaction_id)
  where source_transaction_id is not null;

create index if not exists idx_recurrence_occurrences_scheduled_date
  on public.transaction_recurrence_occurrences (scheduled_date);

create index if not exists idx_recurrence_occurrences_status
  on public.transaction_recurrence_occurrences (status);

-- ============================================================
-- updated_at maintenance
-- ============================================================

create or replace function public.set_recurrence_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_transaction_recurrences_updated_at on public.transaction_recurrences;

create trigger trg_transaction_recurrences_updated_at
before update on public.transaction_recurrences
for each row
execute function public.set_recurrence_updated_at();

drop trigger if exists trg_recurrence_occurrences_updated_at on public.transaction_recurrence_occurrences;

create trigger trg_recurrence_occurrences_updated_at
before update on public.transaction_recurrence_occurrences
for each row
execute function public.set_recurrence_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table public.transaction_recurrences enable row level security;
alter table public.transaction_recurrence_occurrences enable row level security;

-- transaction_recurrences: access follows the linked account,
-- mirroring the transactions policies.

drop policy if exists transaction_recurrences_select on public.transaction_recurrences;
create policy transaction_recurrences_select on public.transaction_recurrences
  for select to authenticated
  using (public.can_view_account(account_id, auth.uid()));

drop policy if exists transaction_recurrences_insert on public.transaction_recurrences;
create policy transaction_recurrences_insert on public.transaction_recurrences
  for insert to authenticated
  with check (
    public.can_post_to_account(account_id, auth.uid())
    and owner_user_id = auth.uid()
  );

drop policy if exists transaction_recurrences_update on public.transaction_recurrences;
create policy transaction_recurrences_update on public.transaction_recurrences
  for update to authenticated
  using (
    owner_user_id = auth.uid()
    or public.can_edit_account(account_id, auth.uid())
  )
  with check (public.can_post_to_account(account_id, auth.uid()));

drop policy if exists transaction_recurrences_delete on public.transaction_recurrences;
create policy transaction_recurrences_delete on public.transaction_recurrences
  for delete to authenticated
  using (
    owner_user_id = auth.uid()
    or public.can_edit_account(account_id, auth.uid())
  );

-- transaction_recurrence_occurrences: access via parent recurrence

drop policy if exists recurrence_occurrences_select on public.transaction_recurrence_occurrences;
create policy recurrence_occurrences_select on public.transaction_recurrence_occurrences
  for select to authenticated
  using (
    exists (
      select 1
      from public.transaction_recurrences r
      where r.id = recurrence_id
        and public.can_view_account(r.account_id, auth.uid())
    )
  );

drop policy if exists recurrence_occurrences_insert on public.transaction_recurrence_occurrences;
create policy recurrence_occurrences_insert on public.transaction_recurrence_occurrences
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.transaction_recurrences r
      where r.id = recurrence_id
        and public.can_post_to_account(r.account_id, auth.uid())
    )
  );

drop policy if exists recurrence_occurrences_update on public.transaction_recurrence_occurrences;
create policy recurrence_occurrences_update on public.transaction_recurrence_occurrences
  for update to authenticated
  using (
    exists (
      select 1
      from public.transaction_recurrences r
      where r.id = recurrence_id
        and public.can_post_to_account(r.account_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.transaction_recurrences r
      where r.id = recurrence_id
        and public.can_post_to_account(r.account_id, auth.uid())
    )
  );

drop policy if exists recurrence_occurrences_delete on public.transaction_recurrence_occurrences;
create policy recurrence_occurrences_delete on public.transaction_recurrence_occurrences
  for delete to authenticated
  using (
    exists (
      select 1
      from public.transaction_recurrences r
      where r.id = recurrence_id
        and (
          r.owner_user_id = auth.uid()
          or public.can_edit_account(r.account_id, auth.uid())
        )
    )
  );
