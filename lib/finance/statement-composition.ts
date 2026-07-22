import {
  compareIsoDates,
  getCreditCardBillingConfig,
  isDateInStatementCycle,
  isRolledIntoOpenStatementPurchase,
  roundMoney,
  type CreditCardBillingConfig,
  type StatementCycle,
  type StatementSettlement,
} from "@/lib/finance/credit-card-billing";
import type { Account } from "@/types/account";
import type { Transaction } from "@/types/transaction";

/** Expense lines that form the open-bill amount due. */
export type StatementCompositionGroupKey = "cycle" | "rolled_in";

export const STATEMENT_COMPOSITION_GROUP_LABELS: Record<
  StatementCompositionGroupKey,
  string
> = {
  cycle: "Despesas do ciclo",
  /** Human label for near-previous-close posts that still land on this bill. */
  rolled_in: "Na virada do fechamento",
};

export const STATEMENT_COMPOSITION_GROUP_HINTS: Record<
  StatementCompositionGroupKey,
  string
> = {
  cycle: "Gastos com data dentro do período desta fatura.",
  rolled_in:
    "Parcelas e lançamentos da virada do fechamento anterior que o emissor ainda inclui neste total a pagar.",
};

export type StatementCompositionLine = {
  id: string;
  date: string;
  description: string;
  amount: number;
  group: StatementCompositionGroupKey;
};

export type StatementComposition = {
  cyclePurchasesTotal: number;
  rolledInPurchasesTotal: number;
  amountDueTotal: number;
  cycleLines: StatementCompositionLine[];
  rolledInLines: StatementCompositionLine[];
  hasRolledIn: boolean;
  /** True when amount due equals cycle-only expenses (no rolled-in). */
  isCycleOnly: boolean;
  equationSummary: string;
};

export type StatementCompositionTransaction = Pick<
  Transaction,
  "id" | "amount" | "type" | "date" | "accountId" | "description"
>;

/**
 * Classifies a card expense into the open-bill composition groups.
 * Returns null for incomes, transfers, or expenses outside the open window.
 */
export function classifyStatementCompositionExpense(input: {
  transaction: StatementCompositionTransaction;
  cardAccountId: string;
  cycle: StatementCycle;
  config: CreditCardBillingConfig;
}): StatementCompositionGroupKey | null {
  const { transaction, cardAccountId, cycle, config } = input;
  if (transaction.accountId !== cardAccountId) {
    return null;
  }
  if (transaction.type !== "expense") {
    return null;
  }

  if (isDateInStatementCycle(transaction.date, cycle)) {
    return "cycle";
  }

  if (
    isRolledIntoOpenStatementPurchase(transaction.date, {
      cycle,
      closingDay: config.statementClosingDay,
    })
  ) {
    return "rolled_in";
  }

  return null;
}

/**
 * Builds the didactic composition of amount due:
 * despesas do ciclo + na virada do fechamento = total a pagar.
 */
export function buildStatementComposition(input: {
  cardAccountId: string;
  config: CreditCardBillingConfig;
  cycle: StatementCycle;
  periodLabel: string;
  transactions: StatementCompositionTransaction[];
  /**
   * Optional settlement snapshot for totals consistency.
   * When omitted, totals are derived from classified lines.
   */
  settlement?: Pick<
    StatementSettlement,
    "cyclePurchasesTotal" | "rolledInPurchasesTotal" | "amountDueTotal"
  >;
}): StatementComposition {
  const cycleLines: StatementCompositionLine[] = [];
  const rolledInLines: StatementCompositionLine[] = [];

  for (const transaction of input.transactions) {
    const group = classifyStatementCompositionExpense({
      transaction,
      cardAccountId: input.cardAccountId,
      cycle: input.cycle,
      config: input.config,
    });

    if (!group) {
      continue;
    }

    const line: StatementCompositionLine = {
      id: transaction.id,
      date: transaction.date.slice(0, 10),
      description: transaction.description,
      amount: Math.abs(Number(transaction.amount)),
      group,
    };

    if (group === "cycle") {
      cycleLines.push(line);
    } else {
      rolledInLines.push(line);
    }
  }

  const sortByDateDesc = (
    left: StatementCompositionLine,
    right: StatementCompositionLine,
  ) => {
    const byDate = compareIsoDates(right.date, left.date);
    if (byDate !== 0) return byDate;
    return right.id.localeCompare(left.id);
  };

  cycleLines.sort(sortByDateDesc);
  rolledInLines.sort(sortByDateDesc);

  const derivedCycleTotal = roundMoney(
    cycleLines.reduce((sum, line) => sum + line.amount, 0),
  );
  const derivedRolledInTotal = roundMoney(
    rolledInLines.reduce((sum, line) => sum + line.amount, 0),
  );

  const cyclePurchasesTotal =
    input.settlement?.cyclePurchasesTotal ?? derivedCycleTotal;
  const rolledInPurchasesTotal =
    input.settlement?.rolledInPurchasesTotal ?? derivedRolledInTotal;
  const amountDueTotal =
    input.settlement?.amountDueTotal ??
    roundMoney(cyclePurchasesTotal + rolledInPurchasesTotal);

  // When settlement intentionally omits virada (closed cycles in Faturas),
  // keep the detail lines consistent with the totals shown.
  const visibleRolledInLines =
    rolledInPurchasesTotal > 0.005 ? rolledInLines : [];

  const hasRolledIn = rolledInPurchasesTotal > 0.005;
  const isCycleOnly = !hasRolledIn;

  const equationSummary = hasRolledIn
    ? `Total a pagar = despesas do ciclo (${input.periodLabel}) + na virada do fechamento.`
    : `Total a pagar = despesas do ciclo (${input.periodLabel}). Não há lançamentos da virada nesta fatura.`;

  return {
    cyclePurchasesTotal,
    rolledInPurchasesTotal,
    amountDueTotal,
    cycleLines,
    rolledInLines: visibleRolledInLines,
    hasRolledIn,
    isCycleOnly,
    equationSummary,
  };
}

export function buildStatementCompositionForAccount(input: {
  cardAccount: Pick<
    Account,
    "id" | "type" | "statement_closing_day" | "statement_due_day"
  >;
  cycle: StatementCycle;
  periodLabel: string;
  transactions: StatementCompositionTransaction[];
  settlement?: Pick<
    StatementSettlement,
    "cyclePurchasesTotal" | "rolledInPurchasesTotal" | "amountDueTotal"
  >;
}): StatementComposition | null {
  const config =
    getCreditCardBillingConfig(input.cardAccount) ??
    ({
      statementClosingDay: Number(input.cycle.closingDate.slice(8, 10)),
      statementDueDay: Number(input.cycle.dueDate.slice(8, 10)),
    } satisfies CreditCardBillingConfig);

  if (
    !Number.isInteger(config.statementClosingDay) ||
    config.statementClosingDay < 1 ||
    config.statementClosingDay > 31 ||
    !Number.isInteger(config.statementDueDay) ||
    config.statementDueDay < 1 ||
    config.statementDueDay > 31
  ) {
    return null;
  }

  return buildStatementComposition({
    cardAccountId: input.cardAccount.id,
    config,
    cycle: input.cycle,
    periodLabel: input.periodLabel,
    transactions: input.transactions,
    settlement: input.settlement,
  });
}
