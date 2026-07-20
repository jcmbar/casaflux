import type { Account } from "@/types/account";
import type { Transaction } from "@/types/transaction";
import type { PeriodFilter } from "@/lib/finance/period-filter";
import { filterTransactionsByPeriod } from "@/lib/finance/period-filter";
import {
  filterTransactionsForStatementCycleView,
  getCreditCardBillingConfig,
  getCurrentStatementCycle,
  getStatementCycleClosingInMonth,
  getStatementSettlement,
  hasCreditCardBillingConfig,
  type CreditCardBillingConfig,
  type StatementCycle,
  type StatementSettlement,
  type StatementSettlementTransaction,
} from "@/lib/finance/credit-card-billing";

export type CardStatementPeriodContext = {
  account: Account;
  config: CreditCardBillingConfig;
  cycle: StatementCycle;
  settlement: StatementSettlement;
  /** True when list/summaries should use the statement cycle instead of calendar month. */
  usesStatementCycle: boolean;
};

export type CardStatementTransaction = StatementSettlementTransaction & {
  description?: string | null;
};

/**
 * When a configured credit card is selected in month mode, `/lancamentos`
 * must use the statement cycle that closes in that month — not the calendar month.
 */
export function resolveCardStatementPeriodContext(input: {
  account: Account | null;
  period: PeriodFilter;
  transactions: CardStatementTransaction[];
  referenceDate: string;
}): CardStatementPeriodContext | null {
  const { account, period, transactions, referenceDate } = input;
  if (!account || !hasCreditCardBillingConfig(account)) {
    return null;
  }

  const config = getCreditCardBillingConfig(account);
  if (!config) {
    return null;
  }

  const usesStatementCycle = period.mode === "month";
  const cycle = usesStatementCycle
    ? getStatementCycleClosingInMonth(config, period.monthKey)
    : getCurrentStatementCycle(config, referenceDate);

  const settlement = getStatementSettlement({
    accountId: account.id,
    config,
    cycle,
    transactions,
    referenceDate,
  });

  return {
    account,
    config,
    cycle,
    settlement,
    usesStatementCycle,
  };
}

/**
 * Contas card summary — same cycle selection as `/lancamentos` default month view:
 * the statement that **closes** in the reference calendar month.
 *
 * Do not use the accumulating "current open" cycle alone: after closing day,
 * that next cycle is often empty while Lançamentos still shows the month's bill.
 */
export function resolveContasCardStatementContext(input: {
  account: Account;
  transactions: CardStatementTransaction[];
  referenceDate: string;
}): CardStatementPeriodContext | null {
  const monthKey = input.referenceDate.slice(0, 7);
  return resolveCardStatementPeriodContext({
    account: input.account,
    period: { mode: "month", monthKey },
    transactions: input.transactions,
    referenceDate: input.referenceDate,
  });
}

/**
 * Period + account filtering for `/lancamentos`.
 * Credit cards with billing config use the statement cycle in month mode.
 */
export function filterLancamentosTransactions(input: {
  transactions: Transaction[];
  period: PeriodFilter;
  accountFilter: string;
  allAccountsFilter: string;
  cardStatement: CardStatementPeriodContext | null;
}): Transaction[] {
  const {
    transactions,
    period,
    accountFilter,
    allAccountsFilter,
    cardStatement,
  } = input;

  if (
    cardStatement?.usesStatementCycle &&
    accountFilter !== allAccountsFilter
  ) {
    return filterTransactionsForStatementCycleView(transactions, {
      accountId: cardStatement.account.id,
      cycle: cardStatement.cycle,
      config: cardStatement.config,
    });
  }

  const byPeriod = filterTransactionsByPeriod(transactions, period);
  if (accountFilter === allAccountsFilter) {
    return byPeriod;
  }

  return byPeriod.filter((transaction) => transaction.accountId === accountFilter);
}
