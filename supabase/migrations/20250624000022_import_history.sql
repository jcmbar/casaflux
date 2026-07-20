-- Import history: batches and row identities for duplicate protection (no financial commit).

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  family_id uuid references public.families (id) on delete set null,
  account_id uuid not null references public.accounts (id) on delete cascade,
  source text not null check (source in ('nubank_checking', 'nubank_credit_card')),
  file_name text,
  content_hash text not null,
  row_count integer not null default 0 check (row_count >= 0),
  status text not null default 'registered'
    check (status in ('registered', 'committed', 'failed')),
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.import_batches is
  'Tracks CSV import batches for dedupe and audit. Does not create financial transactions.';

create index import_batches_account_hash_idx
  on public.import_batches (account_id, content_hash);

create index import_batches_owner_imported_at_idx
  on public.import_batches (owner_user_id, imported_at desc);

create table public.import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  source text not null check (source in ('nubank_checking', 'nubank_credit_card')),
  source_line integer not null check (source_line > 0),
  identity_key text not null,
  external_fingerprint text not null,
  external_id text,
  kind text not null,
  row_date date not null,
  amount numeric(14, 2) not null check (amount >= 0),
  direction text not null check (direction in ('in', 'out')),
  description text not null,
  created_at timestamptz not null default now()
);

comment on table public.import_batch_rows is
  'Row identities from registered import batches, used for historical dedupe.';

create unique index import_batch_rows_account_identity_uidx
  on public.import_batch_rows (owner_user_id, account_id, identity_key);

create index import_batch_rows_account_external_id_idx
  on public.import_batch_rows (owner_user_id, account_id, external_id)
  where external_id is not null;

create index import_batch_rows_batch_id_idx
  on public.import_batch_rows (batch_id);

alter table public.import_batches enable row level security;
alter table public.import_batch_rows enable row level security;

drop policy if exists import_batches_select on public.import_batches;
create policy import_batches_select on public.import_batches
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    and public.can_view_account(account_id, auth.uid())
  );

drop policy if exists import_batches_insert on public.import_batches;
create policy import_batches_insert on public.import_batches
  for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and public.can_post_to_account(account_id, auth.uid())
  );

drop policy if exists import_batch_rows_select on public.import_batch_rows;
create policy import_batch_rows_select on public.import_batch_rows
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    and public.can_view_account(account_id, auth.uid())
  );

drop policy if exists import_batch_rows_insert on public.import_batch_rows;
create policy import_batch_rows_insert on public.import_batch_rows
  for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and public.can_post_to_account(account_id, auth.uid())
    and exists (
      select 1
      from public.import_batches b
      where b.id = batch_id
        and b.owner_user_id = auth.uid()
        and b.account_id = account_id
    )
  );
