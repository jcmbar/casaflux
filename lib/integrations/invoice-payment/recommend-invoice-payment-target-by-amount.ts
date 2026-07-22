import {
  formatFullBrDate,
  getStatementSettlement,
  roundMoney,
  type CreditCardBillingConfig,
  type StatementSettlementTransaction,
} from "@/lib/finance/credit-card-billing";
import type { CardStatementCycleRecord } from "@/lib/finance/card-statement-cycles";
import { formatCurrency } from "@/lib/format";
import type {
  InvoicePaymentCycleTarget,
  InvoicePaymentCycleTargetOption,
  InvoicePaymentCycleTargetSelection,
  InvoicePaymentDueDateOption,
} from "@/lib/integrations/invoice-payment/invoice-payment-cycle-target";
import {
  applyInvoicePaymentDueDateChange,
  deriveInvoicePaymentSuggestionForDueDate,
  type InvoicePaymentCycleResolveContext,
} from "@/lib/integrations/invoice-payment/invoice-payment-cycle-target";

/** Same tolerance used when comparing payment vs real invoice total in the panel. */
export const INVOICE_PAYMENT_AMOUNT_MATCH_TOLERANCE = 0.05;

const REMAINING_EPSILON = 0.005;

export type InvoicePaymentAmountMatchCandidate = {
  closingDate: string;
  dueDate: string;
  dueDateLabel: string;
  amountDue: number;
  remainingTotal: number | null;
  suggestion: InvoicePaymentCycleTarget | null;
};

export type InvoicePaymentAmountMatchRecommendation =
  | {
      kind: "unique";
      match: InvoicePaymentAmountMatchCandidate;
      message: string;
    }
  | {
      kind: "ambiguous";
      matches: InvoicePaymentAmountMatchCandidate[];
      message: string;
    }
  | {
      kind: "none";
      matches: [];
      message: null;
    };

function importedRecordToSettlementCycle(record: CardStatementCycleRecord) {
  return {
    cycleId: record.closingDate.slice(0, 10),
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    closingDate: record.closingDate.slice(0, 10),
    dueDate: record.dueDate.slice(0, 10),
    source: record.source,
    issuerAmountDue: record.amountDue,
  };
}

function amountsCompatible(
  paymentAmount: number,
  invoiceAmount: number,
  tolerance: number,
): boolean {
  return (
    Math.abs(roundMoney(Math.abs(paymentAmount)) - roundMoney(invoiceAmount)) <=
    tolerance
  );
}

function buildUniqueRecommendationMessage(
  match: InvoicePaymentAmountMatchCandidate,
): string {
  return `Encontramos uma fatura pendente com valor compatível: ${formatCurrency(match.amountDue)} · vencimento ${match.dueDateLabel}`;
}

function buildAmbiguousRecommendationMessage(
  matches: InvoicePaymentAmountMatchCandidate[],
): string {
  return `Há ${matches.length} faturas pendentes com valor compatível. Revise o vencimento antes de aplicar.`;
}

/**
 * Recommends an imported invoice target when the payment amount matches a real
 * bill total for a cycle that still appears to be awaiting payment.
 *
 * - Uses only imported cycles with known `amountDue` (no estimates).
 * - When settlement data is available, excludes already-paid cycles.
 * - Unique match → strong recommendation (safe to pre-select).
 * - Multiple matches → ambiguous (do not auto-apply).
 */
export function recommendImportedInvoicePaymentTargetByAmount(input: {
  paymentAmount: number;
  paymentDate: string;
  importedCycles: readonly CardStatementCycleRecord[];
  billingConfig?: CreditCardBillingConfig | null;
  cardAccountId?: string;
  settlementTransactions?: readonly StatementSettlementTransaction[];
  context?: InvoicePaymentCycleResolveContext | null;
  tolerance?: number;
}): InvoicePaymentAmountMatchRecommendation {
  const paymentAmount = Math.abs(Number(input.paymentAmount));
  if (!(paymentAmount > 0) || !input.importedCycles.length) {
    return { kind: "none", matches: [], message: null };
  }

  const tolerance = input.tolerance ?? INVOICE_PAYMENT_AMOUNT_MATCH_TOLERANCE;
  const canSettle = Boolean(
    input.billingConfig &&
      input.cardAccountId &&
      input.settlementTransactions,
  );

  const matches: InvoicePaymentAmountMatchCandidate[] = [];

  for (const record of input.importedCycles) {
    if (record.amountDue == null) {
      continue;
    }

    const amountDue = roundMoney(Number(record.amountDue));
    if (!(amountDue > 0)) {
      continue;
    }

    if (!amountsCompatible(paymentAmount, amountDue, tolerance)) {
      continue;
    }

    let remainingTotal: number | null = null;
    if (canSettle) {
      const settlement = getStatementSettlement({
        accountId: input.cardAccountId!,
        cycle: importedRecordToSettlementCycle(record),
        config: input.billingConfig!,
        transactions: [...input.settlementTransactions!],
        referenceDate: input.paymentDate.slice(0, 10),
      });
      remainingTotal = settlement.remainingTotal;
      if (remainingTotal <= REMAINING_EPSILON) {
        continue;
      }
    }

    const dueDate = record.dueDate.slice(0, 10);
    const suggestion =
      input.billingConfig && input.context
        ? deriveInvoicePaymentSuggestionForDueDate(
            dueDate,
            input.billingConfig,
            input.paymentDate,
            input.context,
          )
        : input.billingConfig
          ? deriveInvoicePaymentSuggestionForDueDate(
              dueDate,
              input.billingConfig,
              input.paymentDate,
              { importedCycles: input.importedCycles },
            )
          : null;

    matches.push({
      closingDate: record.closingDate.slice(0, 10),
      dueDate,
      dueDateLabel: formatFullBrDate(dueDate),
      amountDue,
      remainingTotal,
      suggestion,
    });
  }

  matches.sort((left, right) => right.dueDate.localeCompare(left.dueDate));

  if (matches.length === 0) {
    return { kind: "none", matches: [], message: null };
  }

  if (matches.length === 1) {
    const match = matches[0]!;
    return {
      kind: "unique",
      match,
      message: buildUniqueRecommendationMessage(match),
    };
  }

  return {
    kind: "ambiguous",
    matches,
    message: buildAmbiguousRecommendationMessage(matches),
  };
}

/** Pre-select unique amount match only when the user has not chosen a due date yet. */
export function applyUniqueAmountMatchToCycleTargetSelection(input: {
  selection: InvoicePaymentCycleTargetSelection;
  recommendation: InvoicePaymentAmountMatchRecommendation;
  billingConfig?: CreditCardBillingConfig | null;
  paymentDate?: string;
  context?: InvoicePaymentCycleResolveContext | null;
}): InvoicePaymentCycleTargetSelection {
  const { selection, recommendation } = input;
  if (recommendation.kind !== "unique") {
    return selection;
  }

  if (
    selection.targetDueDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(selection.targetDueDate.slice(0, 10))
  ) {
    return selection;
  }

  if (!input.billingConfig || !input.paymentDate) {
    return {
      target: recommendation.match.suggestion ?? "previous",
      targetDueDate: recommendation.match.dueDate,
    };
  }

  return applyInvoicePaymentDueDateChange(
    recommendation.match.dueDate,
    input.billingConfig,
    input.paymentDate,
    input.context,
  );
}

export function applyAmountMatchRecommendationToCycleTargetOptions(
  options: InvoicePaymentCycleTargetOption[],
  recommendation: InvoicePaymentAmountMatchRecommendation,
): InvoicePaymentCycleTargetOption[] {
  if (recommendation.kind !== "unique") {
    return options;
  }

  const due = recommendation.match.dueDate;
  return options.map((option) => ({
    ...option,
    recommended: option.dueDate?.slice(0, 10) === due,
  }));
}

export function applyAmountMatchRecommendationToDueDateOptions(
  options: InvoicePaymentDueDateOption[],
  recommendation: InvoicePaymentAmountMatchRecommendation,
): InvoicePaymentDueDateOption[] {
  if (recommendation.kind !== "unique") {
    return options;
  }

  const due = recommendation.match.dueDate;
  return options.map((option) => ({
    ...option,
    recommended: option.dueDate.slice(0, 10) === due,
  }));
}
