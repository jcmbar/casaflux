-- Clear legacy issuer totals that were incorrectly stored as the payment
-- amount during invoice-payment import. /faturas now prefers purchase-window
-- sums; amount_due remains only as a fallback when a cycle has no expenses.

update public.card_statement_cycles
set amount_due = null
where amount_due is not null;

-- Repair synthetic sibling cycles created when capture used statement_closing_day
-- instead of the CSV file closing, while notes still record the real file closing.
-- Example: closing_date=2026-04-25 with notes mentioning fechamento 2026-04-24,
-- same due_date as the real file cycle.
--
-- Notes format (from capture-imported-statement-cycle.ts):
--   'Ciclo capturado na importação (fechamento YYYY-MM-DD, vencimento YYYY-MM-DD).'
-- closing_date / due_date are date; transactions.statement_cycle_id is text ISO.

with synthetic as (
  select
    c.id,
    c.account_id,
    c.closing_date as synthetic_closing,
    c.due_date,
    case
      when substring(
        c.notes
        from 'fechamento ([0-9]{4}-[0-9]{2}-[0-9]{2})'
      ) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then to_date(
        substring(
          c.notes
          from 'fechamento ([0-9]{4}-[0-9]{2}-[0-9]{2})'
        ),
        'YYYY-MM-DD'
      )
      else null
    end as file_closing
  from public.card_statement_cycles c
  where c.source = 'imported'
    and c.notes is not null
    and c.notes like 'Ciclo capturado na importação (fechamento %'
),
pairs as (
  select
    s.id as synthetic_id,
    s.account_id,
    s.synthetic_closing,
    s.file_closing,
    f.id as file_id
  from synthetic s
  join public.card_statement_cycles f
    on f.account_id = s.account_id
   and f.closing_date = s.file_closing
   and f.due_date = s.due_date
   and f.id <> s.id
  where s.file_closing is not null
    and s.file_closing <> s.synthetic_closing
)
update public.transactions t
set statement_cycle_id = to_char(p.file_closing, 'YYYY-MM-DD')
from pairs p
where t.account_id = p.account_id
  and t.statement_cycle_id = to_char(p.synthetic_closing, 'YYYY-MM-DD');

with synthetic as (
  select
    c.id,
    c.account_id,
    c.closing_date as synthetic_closing,
    c.due_date,
    case
      when substring(
        c.notes
        from 'fechamento ([0-9]{4}-[0-9]{2}-[0-9]{2})'
      ) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then to_date(
        substring(
          c.notes
          from 'fechamento ([0-9]{4}-[0-9]{2}-[0-9]{2})'
        ),
        'YYYY-MM-DD'
      )
      else null
    end as file_closing
  from public.card_statement_cycles c
  where c.source = 'imported'
    and c.notes is not null
    and c.notes like 'Ciclo capturado na importação (fechamento %'
),
pairs as (
  select
    s.id as synthetic_id,
    s.account_id,
    s.synthetic_closing,
    s.file_closing
  from synthetic s
  join public.card_statement_cycles f
    on f.account_id = s.account_id
   and f.closing_date = s.file_closing
   and f.due_date = s.due_date
   and f.id <> s.id
  where s.file_closing is not null
    and s.file_closing <> s.synthetic_closing
)
delete from public.card_statement_cycles c
using pairs p
where c.id = p.synthetic_id
  and not exists (
    select 1
    from public.transactions t
    where t.account_id = p.account_id
      and t.statement_cycle_id = to_char(p.synthetic_closing, 'YYYY-MM-DD')
  );
