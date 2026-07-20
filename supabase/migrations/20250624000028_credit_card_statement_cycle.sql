-- Credit-card statement cycle configuration on accounts.
-- Only meaningful for type = credit_card; other types keep these null.

alter table public.accounts
  add column if not exists statement_closing_day smallint
    check (
      statement_closing_day is null
      or (statement_closing_day >= 1 and statement_closing_day <= 31)
    );

alter table public.accounts
  add column if not exists statement_due_day smallint
    check (
      statement_due_day is null
      or (statement_due_day >= 1 and statement_due_day <= 31)
    );

comment on column public.accounts.statement_closing_day is
  'Day of month when the credit-card statement closes (1–31). Null for non-card accounts.';

comment on column public.accounts.statement_due_day is
  'Day of month when the credit-card statement is due (1–31). Null for non-card accounts.';
