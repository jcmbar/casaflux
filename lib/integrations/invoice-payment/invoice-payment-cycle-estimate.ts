import {
  addDaysIso,
  getStatementSettlement,
  roundMoney,
  type CreditCardBillingConfig,
  type StatementSettlementTransaction,
} from "@/lib/finance/credit-card-billing";
import { formatCurrency } from "@/lib/format";
import type { ImportPreviewRow } from "../types";
import type {
  InvoicePaymentCycleTargetSelection,
  InvoicePaymentCycleResolveContext,
} from "./invoice-payment-cycle-target";
import { resolveInvoicePaymentCycleTarget } from "./invoice-payment-cycle-target";

const MONEY_EPSILON = 0.005;

export type InvoicePaymentCycleTargetEstimatedEffect = {
  text: string;
  remainingAfterCredit: number;
  /** Remaining on the target bill before applying this credit. */
  remainingBeforeCredit: number;
  amountDueTotal: number;
  target: InvoicePaymentCycleTargetSelection["target"];
};

export function buildPreviewPurchaseSettlementTransactions(input: {
  cardAccountId: string;
  previewRows: ImportPreviewRow[];
}): StatementSettlementTransaction[] {
  return input.previewRows
    .filter(
      (row) =>
        row.kind === "card_purchase" &&
        row.historicalStatus === "new" &&
        row.reviewStatus !== "invalid" &&
        row.reviewStatus !== "already_imported",
    )
    .map((row) => ({
      accountId: input.cardAccountId,
      date: row.date,
      type: "expense" as const,
      amount: row.amount,
    }));
}

export function mergeSettlementTransactionsForEstimate(
  persisted: StatementSettlementTransaction[],
  previewPurchases: StatementSettlementTransaction[],
): StatementSettlementTransaction[] {
  return [...persisted, ...previewPurchases];
}

export function getInvoicePaymentCycleTargetEstimatedEffect(input: {
  billingConfig: CreditCardBillingConfig;
  cardAccountId: string;
  paymentDate: string;
  creditAmount: number;
  cycleTargetSelection: InvoicePaymentCycleTargetSelection;
  transactions: StatementSettlementTransaction[];
  referenceDate?: string;
  context?: InvoicePaymentCycleResolveContext | null;
}): InvoicePaymentCycleTargetEstimatedEffect | null {
  if (!(input.creditAmount > 0)) {
    return null;
  }

  const cycle = resolveInvoicePaymentCycleTarget(
    input.billingConfig,
    input.paymentDate,
    input.cycleTargetSelection,
    input.context,
  );
  const referenceDate = input.referenceDate ?? input.paymentDate;
  const target = input.cycleTargetSelection.target;

  const beforeCredit = getStatementSettlement({
    accountId: input.cardAccountId,
    config: input.billingConfig,
    cycle,
    transactions: input.transactions,
    referenceDate,
  });

  const withCredit = getStatementSettlement({
    accountId: input.cardAccountId,
    config: input.billingConfig,
    cycle,
    transactions: [
      ...input.transactions,
      {
        accountId: input.cardAccountId,
        date: input.paymentDate,
        type: "income",
        amount: input.creditAmount,
        statementCycleId: cycle.cycleId,
        invoicePaymentOrigin: "imported",
      },
    ],
    referenceDate,
  });

  const remainingBeforeCredit = beforeCredit.remainingTotal;
  const remainingAfterCredit = withCredit.remainingTotal;
  const amountDueTotal = withCredit.amountDueTotal;
  const isPaidOff = remainingAfterCredit <= MONEY_EPSILON;

  if (isPaidOff) {
    if (target === "current") {
      return {
        target,
        remainingAfterCredit: 0,
        remainingBeforeCredit,
        amountDueTotal,
        text: "A fatura em aberto ficará quitada com este crédito.",
      };
    }

    if (target === "future") {
      return {
        target,
        remainingAfterCredit: 0,
        remainingBeforeCredit,
        amountDueTotal,
        text: "A fatura futura escolhida ficará quitada com este crédito.",
      };
    }

    return {
      target,
      remainingAfterCredit: 0,
      remainingBeforeCredit,
      amountDueTotal,
      text: "Esta fatura ficará quitada com este crédito.",
    };
  }

  const formattedRemaining = formatCurrency(remainingAfterCredit);

  if (target === "current") {
    return {
      target,
      remainingAfterCredit,
      remainingBeforeCredit,
      amountDueTotal,
      text: `Saldo restante da fatura em aberto após este crédito: ${formattedRemaining}.`,
    };
  }

  if (target === "future") {
    return {
      target,
      remainingAfterCredit,
      remainingBeforeCredit,
      amountDueTotal,
      text: `Saldo restante estimado na fatura futura após este crédito: ${formattedRemaining}.`,
    };
  }

  return {
    target,
    remainingAfterCredit,
    remainingBeforeCredit,
    amountDueTotal,
    text: `Saldo restante após este crédito: ${formattedRemaining}.`,
  };
}

/** Window wide enough to cover previous, open and future target cycles. */
export function getInvoicePaymentEstimateTransactionWindow(input: {
  billingConfig: CreditCardBillingConfig;
  paymentDates: string[];
  context?: InvoicePaymentCycleResolveContext | null;
}): { dateFrom: string; dateTo: string } {
  if (input.paymentDates.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    return { dateFrom: addDaysIso(today, -120), dateTo: addDaysIso(today, 120) };
  }

  let minDate = input.paymentDates[0]!;
  let maxDate = input.paymentDates[0]!;

  for (const paymentDate of input.paymentDates) {
    const previous = resolveInvoicePaymentCycleTarget(
      input.billingConfig,
      paymentDate,
      { target: "previous" },
      input.context,
    );
    const current = resolveInvoicePaymentCycleTarget(
      input.billingConfig,
      paymentDate,
      { target: "current" },
      input.context,
    );
    const future = resolveInvoicePaymentCycleTarget(
      input.billingConfig,
      paymentDate,
      { target: "future" },
      input.context,
    );

    for (const cycle of [previous, current, future]) {
      if (cycle.periodStart < minDate) {
        minDate = cycle.periodStart;
      }
      if (cycle.dueDate > maxDate) {
        maxDate = cycle.dueDate;
      }
    }
  }

  return {
    dateFrom: addDaysIso(minDate, -7),
    dateTo: addDaysIso(maxDate, 7),
  };
}

export function mapPersistedRowsToSettlementTransactions(
  rows: Array<{
    amount: number;
    type: "income" | "expense" | "transfer";
    account_id: string;
    transaction_date: string;
    statement_cycle_id?: string | null;
    invoice_payment_origin?: "manual" | "imported" | null;
    reconciled_with_transaction_id?: string | null;
  }>,
): StatementSettlementTransaction[] {
  return rows
    .filter((row) => row.type === "income" || row.type === "expense")
    .map((row) => ({
      accountId: row.account_id,
      date: row.transaction_date.slice(0, 10),
      type: row.type as "income" | "expense",
      amount: roundMoney(Number(row.amount)),
      statementCycleId: row.statement_cycle_id?.slice(0, 10) ?? null,
      invoicePaymentOrigin: row.invoice_payment_origin ?? null,
      reconciledWithTransactionId: row.reconciled_with_transaction_id ?? null,
    }));
}
