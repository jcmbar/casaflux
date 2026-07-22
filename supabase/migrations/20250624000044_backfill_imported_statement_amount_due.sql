-- Backfill trusted issuer totals for imported card statements that lost
-- amount_due in 20250624000042 (payment-sized totals were wiped globally).
--
-- Product rule after this patch:
--   imported/manual + amount_due set  → A pagar uses issuerAmountDue
--   derived                           → purchase-window sum only
--
-- Extend `known_issuer_totals` below for other historical imported bills.
-- Rows are applied only when amount_due is still null (idempotent).
-- Do NOT seed payment-sized amounts onto paid bills that should keep the
-- "A pagar = pagamento vinculado" fallback (e.g. 26/03–25/04 Nubank).

with known_issuer_totals (
  account_id,
  closing_date,
  due_date,
  amount_due
) as (
  values
    (
      'ceebe7ee-27ec-449f-a986-d92a16fc2bb9'::uuid,
      '2026-05-25'::date,
      '2026-06-01'::date,
      4654.46::numeric(14, 2)
    )
    -- Add more (account_id, closing_date, due_date, amount_due) rows here.
)
update public.card_statement_cycles as c
set
  amount_due = k.amount_due,
  updated_at = timezone('utc', now())
from known_issuer_totals as k
where c.account_id = k.account_id
  and c.closing_date = k.closing_date
  and c.due_date = k.due_date
  and c.source in ('imported', 'manual')
  and c.amount_due is null;
