import {
  compareIsoDates,
  hasCreditCardBillingConfig,
  STATEMENT_STATUS_LABELS,
  type StatementStatus,
} from "@/lib/finance/credit-card-billing";
import {
  buildCardStatementHistory,
  buildFaturasHref,
  type CardStatementHistoryItem,
  type StatementHistoryTransaction,
} from "@/lib/finance/card-statement-history";
import type { Account } from "@/types/account";

const MONEY_EPSILON = 0.005;

export type UpcomingStatementDueItem = {
  cardAccountId: string;
  cardAccountName: string;
  cycleId: string;
  periodLabel: string;
  dueDate: string;
  dueDateLabel: string;
  amountDueTotal: number;
  paidTotal: number;
  remainingTotal: number;
  status: StatementStatus;
  statusLabel: string;
  isCurrent: boolean;
  /** True when status is overdue (due date passed with remaining balance). */
  needsAttention: boolean;
  href: string;
};

export type UpcomingStatementDueCardInput = {
  account: Pick<
    Account,
    "id" | "name" | "type" | "statement_closing_day" | "statement_due_day"
  >;
  transactions: StatementHistoryTransaction[];
};

/**
 * Product rule for the upcoming-dues list:
 * - include open / partial / overdue with remaining balance
 * - exclude paid (and empty open cycles with nothing left to pay)
 */
export function isRelevantUpcomingStatementDue(item: {
  status: StatementStatus;
  remainingTotal: number;
}): boolean {
  if (item.status === "paid") {
    return false;
  }

  return item.remainingTotal > MONEY_EPSILON;
}

export function toUpcomingStatementDueItem(input: {
  cardAccountId: string;
  cardAccountName: string;
  historyItem: CardStatementHistoryItem;
}): UpcomingStatementDueItem {
  const { historyItem } = input;
  return {
    cardAccountId: input.cardAccountId,
    cardAccountName: input.cardAccountName,
    cycleId: historyItem.cycle.cycleId,
    periodLabel: historyItem.periodLabel,
    dueDate: historyItem.cycle.dueDate,
    dueDateLabel: historyItem.dueDateLabel,
    amountDueTotal: historyItem.settlement.amountDueTotal,
    paidTotal: historyItem.settlement.paidTotal,
    remainingTotal: historyItem.settlement.remainingTotal,
    status: historyItem.status,
    statusLabel: historyItem.statusLabel,
    isCurrent: historyItem.isCurrent,
    needsAttention:
      historyItem.status === "overdue" || historyItem.status === "partial",
    href: buildFaturasHref({
      accountId: input.cardAccountId,
      cycleId: historyItem.cycle.cycleId,
    }),
  };
}

/**
 * Builds a consolidated upcoming-dues list across credit cards.
 * Sorted by due date ascending (nearest / overdue first).
 */
export function buildUpcomingStatementDues(input: {
  cards: UpcomingStatementDueCardInput[];
  referenceDate: string;
  limit?: number;
}): UpcomingStatementDueItem[] {
  const items: UpcomingStatementDueItem[] = [];

  for (const card of input.cards) {
    if (!hasCreditCardBillingConfig(card.account)) {
      continue;
    }

    const history = buildCardStatementHistory({
      cardAccount: card.account,
      transactions: card.transactions,
      referenceDate: input.referenceDate,
    });

    if (!history) {
      continue;
    }

    for (const historyItem of history) {
      if (
        !isRelevantUpcomingStatementDue({
          status: historyItem.status,
          remainingTotal: historyItem.settlement.remainingTotal,
        })
      ) {
        continue;
      }

      items.push(
        toUpcomingStatementDueItem({
          cardAccountId: card.account.id,
          cardAccountName: card.account.name,
          historyItem,
        }),
      );
    }
  }

  items.sort((left, right) => {
    const byDue = compareIsoDates(left.dueDate, right.dueDate);
    if (byDue !== 0) {
      return byDue;
    }
    return left.cardAccountName.localeCompare(right.cardAccountName, "pt-BR");
  });

  if (input.limit != null && input.limit >= 0) {
    return items.slice(0, input.limit);
  }

  return items;
}

export function getUpcomingStatementDuesEmptyMessage(): string {
  return "Nenhuma fatura com saldo a pagar no momento. Tudo em dia.";
}

/** Re-export labels for UI convenience. */
export { STATEMENT_STATUS_LABELS };
