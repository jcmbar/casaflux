import { roundMoney } from "@/lib/finance/credit-card-billing";
import {
  classifyNubankStatementLine,
  type NubankStatementLineKind,
} from "@/lib/integrations/sources/nubank/statement-line-kind";

export type NubankStatementInvoiceGroups = {
  consumption: number;
  fees: number;
  carried: number;
  renegotiationInstallments: number;
  renegotiationCredits: number;
  /** Net renegotiation = installments − credits. */
  renegotiation: number;
  payments: number;
  credits: number;
};

export type NubankStatementInvoiceBreakdown = {
  groups: NubankStatementInvoiceGroups;
  /**
   * Preliminary bill total for this statement file:
   * consumption + fees + carried + reneg installments
   * − reneg credits − credits − paymentsAfterPreviousDue
   */
  amountDue: number;
  /** Payments that reduced this bill (after previous due). */
  paymentsAppliedToBill: number;
  /** Payments treated as prior-bill settlement (on/before previous due). */
  paymentsForPriorBill: number;
  closingDate: string | null;
};

export type NubankStatementInvoiceRow = {
  date: string;
  description: string;
  amount: number;
  /** Optional precomputed kind; otherwise classified from description+amount. */
  kind?: NubankStatementLineKind;
  /** When false, row is skipped (e.g. historicalStatus !== new). */
  include?: boolean;
  /**
   * When true, a PAYMENT always settles a prior bill and never reduces this
   * file's amountDue (e.g. import row explicitly tagged to another due date).
   */
  settlePriorBill?: boolean;
};

function emptyGroups(): NubankStatementInvoiceGroups {
  return {
    consumption: 0,
    fees: 0,
    carried: 0,
    renegotiationInstallments: 0,
    renegotiationCredits: 0,
    renegotiation: 0,
    payments: 0,
    credits: 0,
  };
}

function resolveKind(row: NubankStatementInvoiceRow): NubankStatementLineKind {
  if (row.kind) {
    return row.kind;
  }
  // Signed amount: out positive / in negative for classifier polarity.
  const signed =
    row.amount < 0 ? -Math.abs(row.amount) : Math.abs(row.amount);
  return classifyNubankStatementLine({
    title: row.description,
    amount: signed,
  });
}

/**
 * Infer previous cycle due date from this file's closing (last activity date)
 * and the card's statement due day (1–31). Falls back to closing − 30 days.
 */
export function inferPreviousDueDateFromClosing(input: {
  closingDate: string;
  statementDueDay?: number | null;
}): string {
  const closing = input.closingDate.slice(0, 10);
  const [y, m, d] = closing.split("-").map(Number);
  const closingUtc = Date.UTC(y, m - 1, d);

  // Previous closing ≈ one month before this closing.
  const prevClosing = new Date(closingUtc);
  prevClosing.setUTCMonth(prevClosing.getUTCMonth() - 1);

  const dueDay =
    input.statementDueDay != null &&
    Number.isInteger(input.statementDueDay) &&
    input.statementDueDay >= 1 &&
    input.statementDueDay <= 31
      ? input.statementDueDay
      : null;

  if (dueDay != null) {
    const year = prevClosing.getUTCFullYear();
    const month = prevClosing.getUTCMonth();
    const dim = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(dueDay, dim);
    // Due is usually after previous closing in the same or next month.
    // Prefer due day in the month of previous closing; if that falls before
    // previous closing day, use next month.
    let due = Date.UTC(year, month, day);
    const prevClosingDay = prevClosing.getUTCDate();
    if (day < prevClosingDay) {
      const next = month + 1;
      const ny = year + Math.floor(next / 12);
      const nm = ((next % 12) + 12) % 12;
      const dim2 = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
      due = Date.UTC(ny, nm, Math.min(dueDay, dim2));
    }
    return new Date(due).toISOString().slice(0, 10);
  }

  const fallback = new Date(closingUtc);
  fallback.setUTCDate(fallback.getUTCDate() - 30);
  return fallback.toISOString().slice(0, 10);
}

export function getNubankStatementClosingDateFromRows(
  rows: readonly Pick<NubankStatementInvoiceRow, "date" | "include">[],
): string | null {
  let max: string | null = null;
  for (const row of rows) {
    if (row.include === false) continue;
    const date = row.date.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (max == null || date > max) max = date;
  }
  return max;
}

/**
 * Build financial groups and preliminary amount_due for a Nubank CC statement CSV.
 */
export function buildNubankStatementInvoiceBreakdown(input: {
  rows: readonly NubankStatementInvoiceRow[];
  /** ISO due date of the previous bill; payments on/before this settle the prior bill. */
  previousDueDate?: string | null;
  statementDueDay?: number | null;
}): NubankStatementInvoiceBreakdown {
  const groups = emptyGroups();
  const closingDate = getNubankStatementClosingDateFromRows(input.rows);

  const previousDueDate =
    input.previousDueDate?.slice(0, 10) ??
    (closingDate
      ? inferPreviousDueDateFromClosing({
          closingDate,
          statementDueDay: input.statementDueDay,
        })
      : null);

  let paymentsAppliedToBill = 0;
  let paymentsForPriorBill = 0;

  for (const row of input.rows) {
    if (row.include === false) continue;

    const kind = resolveKind(row);
    const abs = Math.abs(Number(row.amount));
    if (!Number.isFinite(abs)) continue;

    const signed = Number(row.amount);

    switch (kind) {
      case "PURCHASE":
      case "INSTALLMENT":
        // Net consumption: charges increase, merchant refunds (negative) decrease.
        groups.consumption = roundMoney(groups.consumption + signed);
        break;
      case "INTEREST":
      case "IOF":
      case "LATE_FEE":
        groups.fees = roundMoney(groups.fees + abs);
        break;
      case "PREVIOUS_BALANCE":
      case "REVOLVING_BALANCE":
      case "PENDING_PREVIOUS_MONTH":
        groups.carried = roundMoney(groups.carried + abs);
        break;
      case "RENEGOTIATION_INSTALLMENT":
        groups.renegotiationInstallments = roundMoney(
          groups.renegotiationInstallments + abs,
        );
        break;
      case "RENEGOTIATION_CREDIT":
        groups.renegotiationCredits = roundMoney(
          groups.renegotiationCredits + abs,
        );
        break;
      case "CREDIT":
      case "ADJUSTMENT":
        groups.credits = roundMoney(groups.credits + abs);
        break;
      case "PAYMENT": {
        groups.payments = roundMoney(groups.payments + abs);
        const date = row.date.slice(0, 10);
        const settlesPrior =
          row.settlePriorBill === true ||
          (Boolean(previousDueDate) &&
            /^\d{4}-\d{2}-\d{2}$/.test(date) &&
            date <= previousDueDate!);
        if (settlesPrior) {
          paymentsForPriorBill = roundMoney(paymentsForPriorBill + abs);
        } else {
          paymentsAppliedToBill = roundMoney(paymentsAppliedToBill + abs);
        }
        break;
      }
      default:
        // UNKNOWN: treat signed — positive charge, negative credit
        if (signed < 0 || signed === 0) {
          groups.credits = roundMoney(groups.credits + abs);
        } else {
          groups.consumption = roundMoney(groups.consumption + abs);
        }
        break;
    }
  }

  groups.renegotiation = roundMoney(
    groups.renegotiationInstallments - groups.renegotiationCredits,
  );

  const amountDue = roundMoney(
    Math.max(
      0,
      groups.consumption +
        groups.fees +
        groups.carried +
        groups.renegotiationInstallments -
        groups.renegotiationCredits -
        groups.credits -
        paymentsAppliedToBill,
    ),
  );

  return {
    groups,
    amountDue,
    paymentsAppliedToBill,
    paymentsForPriorBill,
    closingDate,
  };
}
