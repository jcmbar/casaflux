-- Track whether an imported invoice total is still provisional (from its own CSV)
-- or confirmed by the next statement's carried-balance lines (Saldo em atraso, etc.).

alter table public.card_statement_cycles
  add column if not exists amount_due_confirmation text not null default 'provisional'
    check (amount_due_confirmation in ('provisional', 'confirmed'));

comment on column public.card_statement_cycles.amount_due_confirmation is
  'provisional = total from this bill CSV; confirmed = next CSV carried lines (or absence thereof) settled the unpaid remainder.';
