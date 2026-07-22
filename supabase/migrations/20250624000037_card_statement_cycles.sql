-- Real / imported credit-card statement cycles.
-- Complements fixed accounts.statement_closing_day / statement_due_day so
-- historical faturas can use issuer dates (weekends, month length, adjustments).

create table if not exists public.card_statement_cycles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  family_id uuid references public.families (id) on delete set null,
  -- Closing date ISO; matches transactions.statement_cycle_id identity.
  closing_date date not null,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  -- Issuer / settled bill total when known (e.g. payment that closed the bill).
  amount_due numeric(14, 2),
  source text not null
    check (source in ('imported', 'manual', 'derived')),
  import_batch_id uuid references public.import_batches (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, closing_date)
);

comment on table public.card_statement_cycles is
  'Persisted credit-card statement cycles. Imported/manual rows override synthetic closing/due-day math in Faturas.';

create index if not exists card_statement_cycles_account_closing_idx
  on public.card_statement_cycles (account_id, closing_date desc);

create index if not exists card_statement_cycles_owner_idx
  on public.card_statement_cycles (owner_user_id, closing_date desc);

alter table public.card_statement_cycles enable row level security;

drop policy if exists card_statement_cycles_select on public.card_statement_cycles;
create policy card_statement_cycles_select on public.card_statement_cycles
  for select
  using (
    owner_user_id = auth.uid()
    or (
      family_id is not null
      and public.is_family_member(family_id, auth.uid())
    )
  );

drop policy if exists card_statement_cycles_insert on public.card_statement_cycles;
create policy card_statement_cycles_insert on public.card_statement_cycles
  for insert
  with check (
    owner_user_id = auth.uid()
    and (
      family_id is null
      or public.is_family_member(family_id, auth.uid())
    )
  );

drop policy if exists card_statement_cycles_update on public.card_statement_cycles;
create policy card_statement_cycles_update on public.card_statement_cycles
  for update
  using (
    owner_user_id = auth.uid()
    or (
      family_id is not null
      and public.is_family_admin(family_id, auth.uid())
    )
  )
  with check (
    owner_user_id = auth.uid()
    or (
      family_id is not null
      and public.is_family_admin(family_id, auth.uid())
    )
  );

drop policy if exists card_statement_cycles_delete on public.card_statement_cycles;
create policy card_statement_cycles_delete on public.card_statement_cycles
  for delete
  using (
    owner_user_id = auth.uid()
    or (
      family_id is not null
      and public.is_family_admin(family_id, auth.uid())
    )
  );

grant select, insert, update, delete on public.card_statement_cycles to authenticated;
