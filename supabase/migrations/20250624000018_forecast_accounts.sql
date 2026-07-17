-- Add a second account dimension for real vs forecast balances.
-- Existing `type` continues to describe the financial institution/product
-- (checking, savings, cash, credit card, investment).

alter table public.accounts
  add column if not exists account_mode text not null default 'real';

alter table public.accounts
  drop constraint if exists accounts_account_mode_check;

alter table public.accounts
  add constraint accounts_account_mode_check
  check (account_mode in ('real', 'forecast'));

comment on column public.accounts.account_mode is
  'Whether the account represents real money or a forecast/provision.';
