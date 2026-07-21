import type { Account, AccountType } from "@/types/account";
import type { Transaction } from "@/types/transaction";

export type CreditCardBillingConfig = {
  statementClosingDay: number;
  statementDueDay: number;
};

export type StatementCycle = {
  /** Stable id: closing date ISO (YYYY-MM-DD). */
  cycleId: string;
  periodStart: string;
  periodEnd: string;
  closingDate: string;
  dueDate: string;
};

export type StatementCycleRelation = "current" | "previous" | "next" | "other";

export type CreditCardBillingAccount = Pick<
  Account,
  "type" | "statement_closing_day" | "statement_due_day"
>;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

export function parseIsoDate(iso: string): {
  year: number;
  monthIndex: number;
  day: number;
} {
  const [yearStr, monthStr, dayStr] = iso.slice(0, 10).split("-");
  return {
    year: Number(yearStr),
    monthIndex: Number(monthStr) - 1,
    day: Number(dayStr),
  };
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function clampDayOfMonth(
  year: number,
  monthIndex: number,
  day: number,
): number {
  return Math.min(Math.max(1, day), daysInMonth(year, monthIndex));
}

export function addMonths(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; monthIndex: number } {
  const absolute = year * 12 + monthIndex + delta;
  return {
    year: Math.floor(absolute / 12),
    monthIndex: ((absolute % 12) + 12) % 12,
  };
}

export function compareIsoDates(left: string, right: string): number {
  return left.slice(0, 10).localeCompare(right.slice(0, 10));
}

export function isValidStatementDay(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= 31;
}

export function hasCreditCardBillingConfig(
  account:
    | Pick<Account, "type" | "statement_closing_day" | "statement_due_day">
    | null
    | undefined,
): account is CreditCardBillingAccount & {
  statement_closing_day: number;
  statement_due_day: number;
} {
  if (!account) {
    return false;
  }

  return (
    account.type === "credit_card" &&
    isValidStatementDay(account.statement_closing_day ?? NaN) &&
    isValidStatementDay(account.statement_due_day ?? NaN)
  );
}

export function getCreditCardBillingConfig(
  account:
    | Pick<Account, "type" | "statement_closing_day" | "statement_due_day">
    | null
    | undefined,
): CreditCardBillingConfig | null {
  if (!hasCreditCardBillingConfig(account)) {
    return null;
  }

  return {
    statementClosingDay: account.statement_closing_day,
    statementDueDay: account.statement_due_day,
  };
}

export function getClosingDateInMonth(
  year: number,
  monthIndex: number,
  closingDay: number,
): string {
  return toIsoDate(
    year,
    monthIndex,
    clampDayOfMonth(year, monthIndex, closingDay),
  );
}

/**
 * Due date for a statement that closes on `closingDate`.
 * If due day is after the closing day-of-month, due is in the same month;
 * otherwise due falls in the following month (e.g. close 28 / due 5).
 */
export function getDueDateForClosingDate(
  closingDate: string,
  dueDay: number,
): string {
  const { year, monthIndex, day: closingDayOfMonth } = parseIsoDate(closingDate);

  if (dueDay > closingDayOfMonth) {
    return toIsoDate(
      year,
      monthIndex,
      clampDayOfMonth(year, monthIndex, dueDay),
    );
  }

  const next = addMonths(year, monthIndex, 1);
  return toIsoDate(
    next.year,
    next.monthIndex,
    clampDayOfMonth(next.year, next.monthIndex, dueDay),
  );
}

export function getPreviousClosingDate(
  closingDate: string,
  closingDay: number,
): string {
  const { year, monthIndex } = parseIsoDate(closingDate);
  const previous = addMonths(year, monthIndex, -1);
  return getClosingDateInMonth(previous.year, previous.monthIndex, closingDay);
}

export function addDaysIso(iso: string, deltaDays: number): string {
  const { year, monthIndex, day } = parseIsoDate(iso);
  const utc = new Date(Date.UTC(year, monthIndex, day + deltaDays));
  return toIsoDate(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

export function buildStatementCycle(input: {
  closingDate: string;
  closingDay: number;
  dueDay: number;
}): StatementCycle {
  const previousClosing = getPreviousClosingDate(
    input.closingDate,
    input.closingDay,
  );
  const periodStart = addDaysIso(previousClosing, 1);
  const dueDate = getDueDateForClosingDate(input.closingDate, input.dueDay);

  return {
    cycleId: input.closingDate.slice(0, 10),
    periodStart,
    periodEnd: input.closingDate.slice(0, 10),
    closingDate: input.closingDate.slice(0, 10),
    dueDate,
  };
}

/**
 * Closing date of the cycle that contains `transactionDate`
 * (period is previousClosing+1 … closingDate, inclusive).
 */
export function getClosingDateForTransactionDate(
  transactionDate: string,
  closingDay: number,
): string {
  const { year, monthIndex, day } = parseIsoDate(transactionDate);
  const thisMonthClosing = getClosingDateInMonth(year, monthIndex, closingDay);

  if (compareIsoDates(transactionDate, thisMonthClosing) <= 0) {
    return thisMonthClosing;
  }

  const next = addMonths(year, monthIndex, 1);
  return getClosingDateInMonth(next.year, next.monthIndex, closingDay);
}

export function getStatementCycleForDate(
  config: CreditCardBillingConfig,
  transactionDate: string,
): StatementCycle {
  const closingDate = getClosingDateForTransactionDate(
    transactionDate,
    config.statementClosingDay,
  );

  return buildStatementCycle({
    closingDate,
    closingDay: config.statementClosingDay,
    dueDay: config.statementDueDay,
  });
}

/**
 * Current open/accumulating statement for a reference date:
 * the cycle whose period contains that date.
 */
export function getCurrentStatementCycle(
  config: CreditCardBillingConfig,
  referenceDate: string,
): StatementCycle {
  return getStatementCycleForDate(config, referenceDate);
}

/**
 * Statement cycle that **closes** in the given calendar month (`YYYY-MM`).
 * Example: month `2026-07` + closing day 25 → period `2026-06-26` … `2026-07-25`.
 */
export function getStatementCycleClosingInMonth(
  config: CreditCardBillingConfig,
  monthKey: string,
): StatementCycle {
  const [yearStr, monthStr] = monthKey.slice(0, 7).split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const closingDate = getClosingDateInMonth(
    year,
    monthIndex,
    config.statementClosingDay,
  );

  return buildStatementCycle({
    closingDate,
    closingDay: config.statementClosingDay,
    dueDay: config.statementDueDay,
  });
}

/** Classifies a cycle relative to the current one using closing dates + config. */
export function classifyStatementCycle(input: {
  cycle: StatementCycle;
  currentCycle: StatementCycle;
  closingDay: number;
}): StatementCycleRelation {
  const cmp = compareIsoDates(
    input.cycle.closingDate,
    input.currentCycle.closingDate,
  );
  if (cmp === 0) return "current";

  const previousClosing = getPreviousClosingDate(
    input.currentCycle.closingDate,
    input.closingDay,
  );
  if (input.cycle.closingDate === previousClosing) return "previous";

  const { year, monthIndex } = parseIsoDate(input.currentCycle.closingDate);
  const next = addMonths(year, monthIndex, 1);
  const nextClosing = getClosingDateInMonth(
    next.year,
    next.monthIndex,
    input.closingDay,
  );
  if (input.cycle.closingDate === nextClosing) return "next";

  return "other";
}

export function isDateInStatementCycle(
  date: string,
  cycle: StatementCycle,
): boolean {
  return (
    compareIsoDates(date, cycle.periodStart) >= 0 &&
    compareIsoDates(date, cycle.periodEnd) <= 0
  );
}

export function formatStatementPeriodLabel(cycle: StatementCycle): string {
  const start = formatShortBrDate(cycle.periodStart);
  const end = formatShortBrDate(cycle.periodEnd);
  return `${start}–${end}`;
}

export function formatShortBrDate(iso: string): string {
  const { day, monthIndex } = parseIsoDate(iso);
  return `${pad2(day)}/${pad2(monthIndex + 1)}`;
}

export function formatFullBrDate(iso: string): string {
  const { year, monthIndex, day } = parseIsoDate(iso);
  return `${pad2(day)}/${pad2(monthIndex + 1)}/${year}`;
}

export type StatementTotals = {
  purchasesTotal: number;
  paymentsTotal: number;
  /** Net statement amount (purchases − payments) in the cycle. */
  statementTotal: number;
  transactionCount: number;
};

export type StatementStatus = "open" | "partial" | "paid" | "overdue";

export type StatementSettlementTransaction = Pick<
  Transaction,
  "amount" | "type" | "date" | "accountId"
> & {
  statementCycleId?: string | null;
  description?: string | null;
  invoicePaymentOrigin?: "manual" | "imported" | null;
  reconciledWithTransactionId?: string | null;
};

/**
 * When manual and imported payment legs are linked as equivalents, count only
 * the imported (or non-manual) leg so the fatura is not paid twice.
 * Unlinked payments always count.
 */
export function shouldCountPaymentTowardSettlement(
  transaction: Pick<
    StatementSettlementTransaction,
    "invoicePaymentOrigin" | "reconciledWithTransactionId"
  >,
): boolean {
  if (!transaction.reconciledWithTransactionId) {
    return true;
  }

  return transaction.invoicePaymentOrigin !== "manual";
}

export type StatementSettlement = {
  cycle: StatementCycle;
  /**
   * Expenses whose `transaction_date` is inside the cycle period
   * (`periodStart` … `periodEnd`). Accounting view of the cycle.
   */
  cyclePurchasesTotal: number;
  /**
   * Expenses dated in the issuer posting window just before `periodStart`
   * (day before previous closing … previous closing). Often installments
   * that still compose the open bill due on `dueDate`.
   */
  rolledInPurchasesTotal: number;
  /**
   * Effective open-statement amount before payments:
   * `cyclePurchasesTotal + rolledInPurchasesTotal`.
   */
  amountDueTotal: number;
  /**
   * Alias of `cyclePurchasesTotal` (cycle-only expenses).
   * Prefer the explicit name in new code.
   */
  purchasesTotal: number;
  /** Payments attributed to this cycle (linked or legacy-inferred). */
  paidTotal: number;
  /** Remaining on the open bill: max(0, amountDueTotal − paidTotal). */
  remainingTotal: number;
  status: StatementStatus;
  purchaseCount: number;
  paymentCount: number;
  rolledInPurchaseCount: number;
};

const MONEY_EPSILON = 0.005;

/**
 * Statement cycle settled by a payment on `paymentDate`:
 * the latest cycle whose closing date is on or before the payment date.
 * Does not require the user to pick a period.
 */
export function getStatementCyclePaidByPaymentDate(
  config: CreditCardBillingConfig,
  paymentDate: string,
): StatementCycle {
  const { year, monthIndex } = parseIsoDate(paymentDate);
  const thisMonthClosing = getClosingDateInMonth(
    year,
    monthIndex,
    config.statementClosingDay,
  );

  let closingDate = thisMonthClosing;
  if (compareIsoDates(thisMonthClosing, paymentDate) > 0) {
    const previous = addMonths(year, monthIndex, -1);
    closingDate = getClosingDateInMonth(
      previous.year,
      previous.monthIndex,
      config.statementClosingDay,
    );
  }

  return buildStatementCycle({
    closingDate,
    closingDay: config.statementClosingDay,
    dueDay: config.statementDueDay,
  });
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Whether a card income should count toward settling `cycle`.
 * Linked payments use `statementCycleId`; legacy payments (null id) are
 * inferred from payment date via getStatementCyclePaidByPaymentDate.
 */
export function isPaymentAttributedToStatementCycle(input: {
  transaction: StatementSettlementTransaction;
  accountId: string;
  cycle: StatementCycle;
  config: CreditCardBillingConfig;
}): boolean {
  const { transaction, accountId, cycle, config } = input;
  if (transaction.accountId !== accountId) return false;
  if (transaction.type !== "income") return false;

  const linkedCycleId = transaction.statementCycleId?.slice(0, 10) ?? null;
  if (linkedCycleId) {
    return linkedCycleId === cycle.cycleId;
  }

  const inferred = getStatementCyclePaidByPaymentDate(config, transaction.date);
  return inferred.cycleId === cycle.cycleId;
}

export function deriveStatementStatus(input: {
  purchasesTotal: number;
  paidTotal: number;
  dueDate: string;
  referenceDate: string;
}): StatementStatus {
  const remaining = roundMoney(input.purchasesTotal - input.paidTotal);

  if (remaining <= MONEY_EPSILON) {
    return "paid";
  }

  if (input.paidTotal > MONEY_EPSILON) {
    return "partial";
  }

  if (compareIsoDates(input.referenceDate, input.dueDate) > 0) {
    return "overdue";
  }

  return "open";
}

/**
 * Open-statement purchase window for the amount due at `cycle.dueDate`.
 *
 * Issuers (e.g. Nubank) often post installment/recurring charges on the
 * previous closing day or the day before, and still include them on the
 * bill that closes on `cycle.closingDate`. Those dates fall outside the
 * strict cycle period (`periodStart` = previousClosing+1) but belong on
 * the open fatura a pagar.
 *
 * Window: [previousClosing − 1 day, periodEnd].
 */
export function getOpenStatementPurchaseWindow(input: {
  cycle: StatementCycle;
  closingDay: number;
}): { windowStart: string; windowEnd: string; previousClosing: string } {
  const previousClosing = getPreviousClosingDate(
    input.cycle.closingDate,
    input.closingDay,
  );
  return {
    previousClosing,
    windowStart: addDaysIso(previousClosing, -1),
    windowEnd: input.cycle.periodEnd,
  };
}

export function isDateInOpenStatementPurchaseWindow(
  date: string,
  input: { cycle: StatementCycle; closingDay: number },
): boolean {
  const { windowStart, windowEnd } = getOpenStatementPurchaseWindow(input);
  return (
    compareIsoDates(date, windowStart) >= 0 &&
    compareIsoDates(date, windowEnd) <= 0
  );
}

export function isRolledIntoOpenStatementPurchase(
  date: string,
  input: { cycle: StatementCycle; closingDay: number },
): boolean {
  if (isDateInStatementCycle(date, input.cycle)) {
    return false;
  }
  return isDateInOpenStatementPurchaseWindow(date, input);
}

/**
 * Full settlement snapshot for a statement cycle.
 * Separates cycle-only expenses from the effective amount due on the open bill.
 */
export function getStatementSettlement(input: {
  accountId: string;
  config: CreditCardBillingConfig;
  cycle: StatementCycle;
  transactions: StatementSettlementTransaction[];
  referenceDate: string;
}): StatementSettlement {
  let cyclePurchasesTotal = 0;
  let rolledInPurchasesTotal = 0;
  let paidTotal = 0;
  let purchaseCount = 0;
  let rolledInPurchaseCount = 0;
  let paymentCount = 0;

  const windowInput = {
    cycle: input.cycle,
    closingDay: input.config.statementClosingDay,
  };

  for (const transaction of input.transactions) {
    if (transaction.accountId !== input.accountId) continue;
    if (transaction.type === "transfer") continue;

    const amount = Math.abs(Number(transaction.amount));

    if (transaction.type === "expense") {
      if (isDateInStatementCycle(transaction.date, input.cycle)) {
        cyclePurchasesTotal += amount;
        purchaseCount += 1;
        continue;
      }

      if (isRolledIntoOpenStatementPurchase(transaction.date, windowInput)) {
        rolledInPurchasesTotal += amount;
        rolledInPurchaseCount += 1;
        continue;
      }

      continue;
    }

    if (
      isPaymentAttributedToStatementCycle({
        transaction,
        accountId: input.accountId,
        cycle: input.cycle,
        config: input.config,
      }) &&
      shouldCountPaymentTowardSettlement(transaction)
    ) {
      paidTotal += amount;
      paymentCount += 1;
    }
  }

  cyclePurchasesTotal = roundMoney(cyclePurchasesTotal);
  rolledInPurchasesTotal = roundMoney(rolledInPurchasesTotal);
  const amountDueTotal = roundMoney(
    cyclePurchasesTotal + rolledInPurchasesTotal,
  );
  paidTotal = roundMoney(paidTotal);
  const remainingTotal = Math.max(0, roundMoney(amountDueTotal - paidTotal));

  return {
    cycle: input.cycle,
    cyclePurchasesTotal,
    rolledInPurchasesTotal,
    amountDueTotal,
    purchasesTotal: cyclePurchasesTotal,
    paidTotal,
    remainingTotal,
    status: deriveStatementStatus({
      purchasesTotal: amountDueTotal,
      paidTotal,
      dueDate: input.cycle.dueDate,
      referenceDate: input.referenceDate,
    }),
    purchaseCount,
    paymentCount,
    rolledInPurchaseCount,
  };
}

/**
 * Whether a card transaction belongs in the open-statement view:
 * expenses in the open-bill purchase window; payments by cycle attribution.
 */
export function isTransactionInStatementCycleView(input: {
  transaction: StatementSettlementTransaction;
  accountId: string;
  cycle: StatementCycle;
  config: CreditCardBillingConfig;
}): boolean {
  const { transaction, accountId, cycle, config } = input;
  if (transaction.accountId !== accountId) return false;
  if (transaction.type === "transfer") return false;

  if (transaction.type === "expense") {
    return isDateInOpenStatementPurchaseWindow(transaction.date, {
      cycle,
      closingDay: config.statementClosingDay,
    });
  }

  if (transaction.type === "income") {
    return isPaymentAttributedToStatementCycle({
      transaction,
      accountId,
      cycle,
      config,
    });
  }

  return false;
}

export function filterTransactionsForStatementCycleView<
  T extends StatementSettlementTransaction,
>(
  transactions: T[],
  input: {
    accountId: string;
    cycle: StatementCycle;
    config: CreditCardBillingConfig;
  },
): T[] {
  return transactions.filter((transaction) =>
    isTransactionInStatementCycleView({
      transaction,
      accountId: input.accountId,
      cycle: input.cycle,
      config: input.config,
    }),
  );
}

/**
 * Sums card transactions in a cycle (legacy helper).
 * Expenses count as purchases; incomes dated inside the period as payments.
 * Prefer getStatementSettlement for quitação/status (payments often fall after closing).
 */
export function summarizeStatementCycleTransactions(
  transactions: Array<
    Pick<Transaction, "amount" | "type" | "date" | "accountId"> & {
      statementCycleId?: string | null;
      description?: string;
    }
  >,
  input: {
    accountId: string;
    cycle: StatementCycle;
    config?: CreditCardBillingConfig;
    referenceDate?: string;
  },
): StatementTotals {
  if (input.config) {
    const settlement = getStatementSettlement({
      accountId: input.accountId,
      config: input.config,
      cycle: input.cycle,
      transactions,
      referenceDate: input.referenceDate ?? input.cycle.dueDate,
    });

    return {
      purchasesTotal: settlement.purchasesTotal,
      paymentsTotal: settlement.paidTotal,
      statementTotal: settlement.remainingTotal,
      transactionCount: settlement.purchaseCount + settlement.paymentCount,
    };
  }

  let purchasesTotal = 0;
  let paymentsTotal = 0;
  let transactionCount = 0;

  for (const transaction of transactions) {
    if (transaction.accountId !== input.accountId) continue;
    if (!isDateInStatementCycle(transaction.date, input.cycle)) continue;
    if (transaction.type === "transfer") continue;

    transactionCount += 1;
    const amount = Math.abs(Number(transaction.amount));

    if (transaction.type === "expense") {
      purchasesTotal += amount;
    } else if (transaction.type === "income") {
      paymentsTotal += amount;
    }
  }

  return {
    purchasesTotal,
    paymentsTotal,
    statementTotal: purchasesTotal - paymentsTotal,
    transactionCount,
  };
}

export const STATEMENT_STATUS_LABELS: Record<StatementStatus, string> = {
  open: "Aberta",
  partial: "Parcial",
  paid: "Paga",
  overdue: "Atrasada",
};

export function getTransactionStatementRelation(input: {
  account: Pick<
    Account,
    "id" | "type" | "statement_closing_day" | "statement_due_day"
  >;
  transactionDate: string;
  referenceDate: string;
}): StatementCycleRelation | null {
  const config = getCreditCardBillingConfig(input.account);
  if (!config) return null;

  const current = getCurrentStatementCycle(config, input.referenceDate);
  const cycle = getStatementCycleForDate(config, input.transactionDate);
  return classifyStatementCycle({
    cycle,
    currentCycle: current,
    closingDay: config.statementClosingDay,
  });
}

export function getCreditCardBillingValidationError(input: {
  type: AccountType;
  statementClosingDay: number | null;
  statementDueDay: number | null;
}): string | null {
  if (input.type !== "credit_card") {
    return null;
  }

  const closing = input.statementClosingDay;
  const due = input.statementDueDay;

  if (closing == null && due == null) {
    return null;
  }

  if (closing == null || due == null) {
    return "Informe o dia de fechamento e o dia de vencimento do cartão.";
  }

  if (!isValidStatementDay(closing) || !isValidStatementDay(due)) {
    return "Dias de fechamento e vencimento devem estar entre 1 e 31.";
  }

  return null;
}

export const STATEMENT_CYCLE_RELATION_LABELS: Record<
  StatementCycleRelation,
  string
> = {
  current: "Fatura atual",
  previous: "Fatura anterior",
  next: "Próxima fatura",
  other: "Outra fatura",
};
