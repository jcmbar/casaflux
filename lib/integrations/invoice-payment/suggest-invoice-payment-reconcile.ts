import { compareIsoDates, roundMoney } from "@/lib/finance/credit-card-billing";

export type InvoicePaymentReconcileConfidence = "high" | "medium";

export type InvoicePaymentReconcileDecision = "link" | "skip";

export type ManualInvoicePaymentCandidate = {
  /** Card-side income leg (counts toward fatura settlement). */
  cardTransactionId: string;
  /** Checking/expense twin, when linked. */
  sourceTransactionId: string | null;
  sourceAccountId: string | null;
  cardAccountId: string;
  amount: number;
  paymentDate: string;
  statementCycleId: string | null;
  reconciledWithTransactionId: string | null;
};

export type ImportedInvoicePaymentMatchInput = {
  amount: number;
  paymentDate: string;
  /** Closing-date ISO of the statement being settled. */
  cycleId: string | null;
  cardAccountId: string;
  /** Selected checking/savings origin for this import row. */
  sourceAccountId: string | null;
};

export type InvoicePaymentReconcileSuggestion = {
  manualCardTransactionId: string;
  manualSourceTransactionId: string | null;
  amount: number;
  paymentDate: string;
  statementCycleId: string;
  sourceAccountId: string | null;
  confidence: InvoicePaymentReconcileConfidence;
  summary: string;
  /** Absolute day gap between manual and imported payment dates. */
  dateDiffDays: number;
};

/** Exact amount match only (V1.5 — no fuzzy amounts). */
export const INVOICE_PAYMENT_RECONCILE_AMOUNT_EPSILON = 0.005;

/** Max |paymentDate − manualDate| for a high-confidence suggestion. */
export const INVOICE_PAYMENT_RECONCILE_MAX_DATE_DAYS = 5;

function parseUtcDay(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

export function getInvoicePaymentDateDiffDays(
  leftIso: string,
  rightIso: string,
): number {
  const ms = Math.abs(parseUtcDay(leftIso) - parseUtcDay(rightIso));
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export function amountsMatchForInvoiceReconcile(
  left: number,
  right: number,
): boolean {
  return (
    Math.abs(roundMoney(left) - roundMoney(right)) <=
    INVOICE_PAYMENT_RECONCILE_AMOUNT_EPSILON
  );
}

/**
 * Safe V1.5 matcher: suggest at most one unreconciled manual twin.
 *
 * Required for any suggestion:
 * - same card
 * - same statement cycle
 * - same source account (must already be selected on the import row)
 * - exact amount
 * - date within {@link INVOICE_PAYMENT_RECONCILE_MAX_DATE_DAYS}
 * - candidate not already reconciled
 *
 * If more than one candidate qualifies, returns null (ambiguous — no auto pick).
 */
export function suggestInvoicePaymentReconcile(input: {
  imported: ImportedInvoicePaymentMatchInput;
  candidates: ManualInvoicePaymentCandidate[];
  /** Manual card tx ids already claimed by another import row in this batch. */
  reservedManualCardTransactionIds?: ReadonlySet<string>;
}): InvoicePaymentReconcileSuggestion | null {
  const { imported, candidates } = input;
  const reserved = input.reservedManualCardTransactionIds ?? new Set<string>();

  if (!imported.cycleId || !imported.sourceAccountId) {
    return null;
  }

  if (!(imported.amount > 0)) {
    return null;
  }

  const matches: InvoicePaymentReconcileSuggestion[] = [];

  for (const candidate of candidates) {
    if (reserved.has(candidate.cardTransactionId)) {
      continue;
    }

    if (candidate.reconciledWithTransactionId) {
      continue;
    }

    if (candidate.cardAccountId !== imported.cardAccountId) {
      continue;
    }

    if (!candidate.statementCycleId) {
      continue;
    }

    if (candidate.statementCycleId.slice(0, 10) !== imported.cycleId.slice(0, 10)) {
      continue;
    }

    if (!candidate.sourceAccountId) {
      continue;
    }

    if (candidate.sourceAccountId !== imported.sourceAccountId) {
      continue;
    }

    if (!amountsMatchForInvoiceReconcile(candidate.amount, imported.amount)) {
      continue;
    }

    const dateDiffDays = getInvoicePaymentDateDiffDays(
      candidate.paymentDate,
      imported.paymentDate,
    );

    if (dateDiffDays > INVOICE_PAYMENT_RECONCILE_MAX_DATE_DAYS) {
      continue;
    }

    const confidence: InvoicePaymentReconcileConfidence =
      dateDiffDays === 0 &&
      compareIsoDates(candidate.paymentDate, imported.paymentDate) === 0
        ? "high"
        : dateDiffDays <= 2
          ? "high"
          : "medium";

    matches.push({
      manualCardTransactionId: candidate.cardTransactionId,
      manualSourceTransactionId: candidate.sourceTransactionId,
      amount: candidate.amount,
      paymentDate: candidate.paymentDate,
      statementCycleId: candidate.statementCycleId.slice(0, 10),
      sourceAccountId: candidate.sourceAccountId,
      confidence,
      dateDiffDays,
      summary:
        dateDiffDays === 0
          ? "Pagamento manual na mesma data, valor, fatura e conta de origem."
          : `Pagamento manual compatível (${dateDiffDays} dia(s) de diferença), mesma fatura e origem.`,
    });
  }

  if (matches.length !== 1) {
    return null;
  }

  return matches[0]!;
}

/**
 * Resolves suggestions for a batch of import rows without double-claiming
 * the same manual payment.
 */
export function suggestInvoicePaymentReconcileForRows(input: {
  rows: Array<{
    sourceLine: number;
    imported: ImportedInvoicePaymentMatchInput;
  }>;
  candidates: ManualInvoicePaymentCandidate[];
}): Record<number, InvoicePaymentReconcileSuggestion> {
  const reserved = new Set<string>();
  const result: Record<number, InvoicePaymentReconcileSuggestion> = {};

  // Prefer earlier CSV lines; stable and predictable.
  const ordered = [...input.rows].sort(
    (left, right) => left.sourceLine - right.sourceLine,
  );

  for (const row of ordered) {
    const suggestion = suggestInvoicePaymentReconcile({
      imported: row.imported,
      candidates: input.candidates,
      reservedManualCardTransactionIds: reserved,
    });

    if (!suggestion) {
      continue;
    }

    reserved.add(suggestion.manualCardTransactionId);
    result[row.sourceLine] = suggestion;
  }

  return result;
}

export function getInvoicePaymentReconcileDecision(
  decisions: Record<number, InvoicePaymentReconcileDecision>,
  sourceLine: number,
): InvoicePaymentReconcileDecision {
  return decisions[sourceLine] ?? "skip";
}
