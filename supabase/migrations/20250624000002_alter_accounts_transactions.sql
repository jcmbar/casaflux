-- Extend accounts and transactions for multi-user / family sharing

-- accounts: new ownership and sharing columns
alter table public.accounts
  add column if not exists owner_user_id uuid references auth.users (id) on delete cascade;

alter table public.accounts
  add column if not exists family_id uuid references public.families (id) on delete cascade;

alter table public.accounts
  add column if not exists is_family_shared boolean not null default false;

alter table public.accounts
  add column if not exists allow_family_view boolean not null default false;

alter table public.accounts
  add column if not exists allow_family_post boolean not null default false;

alter table public.accounts
  add column if not exists allow_family_edit boolean not null default false;

create index if not exists idx_accounts_owner_user_id on public.accounts (owner_user_id);
create index if not exists idx_accounts_family_id on public.accounts (family_id);

-- Constraint accounts_ownership_check is added after legacy data sanitization
-- in 20250624000007_sanitize_legacy_accounts.sql

-- transactions: rename date -> transaction_date when applicable
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'date'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'transaction_date'
  ) then
    alter table public.transactions rename column date to transaction_date;
  end if;
end $$;

alter table public.transactions
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.transactions
  add column if not exists family_id uuid references public.families (id) on delete set null;

create index if not exists idx_transactions_account_id on public.transactions (account_id);
create index if not exists idx_transactions_created_by on public.transactions (created_by);
create index if not exists idx_transactions_family_id on public.transactions (family_id);
create index if not exists idx_transactions_transaction_date on public.transactions (transaction_date);

-- Keep family_id in sync with the account on insert/update
create or replace function public.sync_transaction_family_id()
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

drop trigger if exists trg_sync_transaction_family_id on public.transactions;

create trigger trg_sync_transaction_family_id
before insert or update of account_id on public.transactions
for each row
execute function public.sync_transaction_family_id();
