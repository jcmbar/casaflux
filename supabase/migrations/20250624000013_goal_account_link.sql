-- Optional account link and automatic progress for financial goals

alter table public.financial_goals
  add column if not exists account_id uuid references public.accounts (id) on delete set null,
  add column if not exists progress_mode text not null default 'manual'
    check (progress_mode in ('manual', 'account_balance'));

alter table public.financial_goals drop constraint if exists financial_goals_account_mode_check;

alter table public.financial_goals
  add constraint financial_goals_account_mode_check check (
    progress_mode = 'manual'
    or account_id is not null
  );

create index if not exists idx_financial_goals_account_id
  on public.financial_goals (account_id);

-- Ensure linked accounts are visible to the user creating/updating the goal
drop policy if exists financial_goals_insert on public.financial_goals;
create policy financial_goals_insert on public.financial_goals
  for insert to authenticated
  with check (
    (
      (
        family_id is not null
        and public.is_family_member(family_id, auth.uid())
      )
      or owner_user_id = auth.uid()
    )
    and (
      account_id is null
      or public.can_view_account(account_id, auth.uid())
    )
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
      (
        family_id is not null
        and public.is_family_member(family_id, auth.uid())
      )
      or owner_user_id = auth.uid()
    )
    and (
      account_id is null
      or public.can_view_account(account_id, auth.uid())
    )
  );
