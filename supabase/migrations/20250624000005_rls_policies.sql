-- Row Level Security policies

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invitations enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- families
drop policy if exists families_select_member on public.families;
create policy families_select_member on public.families
  for select to authenticated
  using (public.is_family_member(id, auth.uid()));

drop policy if exists families_insert_authenticated on public.families;
create policy families_insert_authenticated on public.families
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists families_update_admin on public.families;
create policy families_update_admin on public.families
  for update to authenticated
  using (public.is_family_admin(id, auth.uid()))
  with check (public.is_family_admin(id, auth.uid()));

drop policy if exists families_delete_owner on public.families;
create policy families_delete_owner on public.families
  for delete to authenticated
  using (
    exists (
      select 1
      from public.family_members fm
      where fm.family_id = families.id
        and fm.user_id = auth.uid()
        and fm.role = 'owner'
    )
  );

-- family_members
drop policy if exists family_members_select on public.family_members;
create policy family_members_select on public.family_members
  for select to authenticated
  using (public.is_family_member(family_id, auth.uid()));

drop policy if exists family_members_insert on public.family_members;
create policy family_members_insert on public.family_members
  for insert to authenticated
  with check (
    public.can_manage_family_members(family_id, auth.uid())
    or (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1
        from public.families f
        where f.id = family_id
          and f.created_by = auth.uid()
      )
    )
  );

drop policy if exists family_members_update on public.family_members;
create policy family_members_update on public.family_members
  for update to authenticated
  using (public.can_manage_family_members(family_id, auth.uid()))
  with check (public.can_manage_family_members(family_id, auth.uid()));

drop policy if exists family_members_delete on public.family_members;
create policy family_members_delete on public.family_members
  for delete to authenticated
  using (
    public.can_manage_family_members(family_id, auth.uid())
    and role <> 'owner'
  );

-- family_invitations
drop policy if exists family_invitations_select on public.family_invitations;
create policy family_invitations_select on public.family_invitations
  for select to authenticated
  using (public.is_family_member(family_id, auth.uid()));

drop policy if exists family_invitations_insert on public.family_invitations;
create policy family_invitations_insert on public.family_invitations
  for insert to authenticated
  with check (public.can_create_family_invitation(family_id, auth.uid()));

drop policy if exists family_invitations_update on public.family_invitations;
create policy family_invitations_update on public.family_invitations
  for update to authenticated
  using (public.can_create_family_invitation(family_id, auth.uid()))
  with check (public.can_create_family_invitation(family_id, auth.uid()));

drop policy if exists family_invitations_delete on public.family_invitations;
create policy family_invitations_delete on public.family_invitations
  for delete to authenticated
  using (public.can_create_family_invitation(family_id, auth.uid()));

-- accounts
drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts
  for select to authenticated
  using (public.can_view_account(id, auth.uid()));

drop policy if exists accounts_insert on public.accounts;
create policy accounts_insert on public.accounts
  for insert to authenticated
  with check (
    (
      is_family_shared = false
      and owner_user_id = auth.uid()
      and family_id is null
    )
    or (
      is_family_shared = true
      and family_id is not null
      and owner_user_id is null
      and public.is_family_member(family_id, auth.uid())
    )
  );

drop policy if exists accounts_update on public.accounts;
create policy accounts_update on public.accounts
  for update to authenticated
  using (public.can_edit_account(id, auth.uid()))
  with check (public.can_edit_account(id, auth.uid()));

drop policy if exists accounts_delete on public.accounts;
create policy accounts_delete on public.accounts
  for delete to authenticated
  using (public.can_edit_account(id, auth.uid()));

-- transactions
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
  for select to authenticated
  using (public.can_view_account(account_id, auth.uid()));

drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (
    public.can_post_to_account(account_id, auth.uid())
    and created_by = auth.uid()
  );

drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions
  for update to authenticated
  using (public.can_edit_transaction(id, auth.uid()))
  with check (
    public.can_post_to_account(account_id, auth.uid())
    and (
      created_by = auth.uid()
      or public.can_edit_transaction(id, auth.uid())
    )
  );

drop policy if exists transactions_delete on public.transactions;
create policy transactions_delete on public.transactions
  for delete to authenticated
  using (public.can_edit_transaction(id, auth.uid()));

-- categories: authenticated read (shared catalog); writes reserved for future admin flow
alter table if exists public.categories enable row level security;

drop policy if exists categories_select_authenticated on public.categories;
create policy categories_select_authenticated on public.categories
  for select to authenticated
  using (true);
