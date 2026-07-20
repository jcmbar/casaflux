import type { Transaction, TransactionType } from "@/types/transaction";
import {
  TRANSACTION_ORIGIN_LABELS,
  type TransactionOrigin,
} from "@/lib/finance/transaction-origin";
import { TRANSACTION_TYPE_LABELS } from "@/lib/constants";

export type LancamentosTypeFilter = "all" | TransactionType;
export type LancamentosOriginFilter = "all" | TransactionOrigin;

export const LANCAMENTOS_TYPE_FILTERS: readonly LancamentosTypeFilter[] = [
  "all",
  "expense",
  "income",
  "transfer",
] as const;

export const LANCAMENTOS_ORIGIN_FILTERS: readonly LancamentosOriginFilter[] = [
  "all",
  "manual",
  "imported",
] as const;

export const LANCAMENTOS_TYPE_FILTER_LABELS: Record<
  LancamentosTypeFilter,
  string
> = {
  all: "Todos os tipos",
  expense: TRANSACTION_TYPE_LABELS.expense,
  income: TRANSACTION_TYPE_LABELS.income,
  transfer: TRANSACTION_TYPE_LABELS.transfer,
};

export const LANCAMENTOS_ORIGIN_FILTER_LABELS: Record<
  LancamentosOriginFilter,
  string
> = {
  all: "Todas as origens",
  manual: TRANSACTION_ORIGIN_LABELS.manual,
  imported: TRANSACTION_ORIGIN_LABELS.imported,
};

const TYPE_FILTER_SET = new Set<string>(LANCAMENTOS_TYPE_FILTERS);
const ORIGIN_FILTER_SET = new Set<string>(LANCAMENTOS_ORIGIN_FILTERS);

export function parseLancamentosTypeFilter(
  value: string | null | undefined,
): LancamentosTypeFilter {
  if (!value) return "all";
  const normalized = value.trim().toLowerCase();
  if (TYPE_FILTER_SET.has(normalized)) {
    return normalized as LancamentosTypeFilter;
  }
  return "all";
}

export function parseLancamentosOriginFilter(
  value: string | null | undefined,
): LancamentosOriginFilter {
  if (!value) return "all";
  const normalized = value.trim().toLowerCase();
  if (ORIGIN_FILTER_SET.has(normalized)) {
    return normalized as LancamentosOriginFilter;
  }
  return "all";
}

export function filterTransactionsByType<
  T extends Pick<Transaction, "type">,
>(transactions: T[], filter: LancamentosTypeFilter): T[] {
  if (filter === "all") {
    return transactions;
  }
  return transactions.filter((transaction) => transaction.type === filter);
}

export function filterTransactionsByOrigin<
  T extends Pick<Transaction, "id">,
>(
  transactions: T[],
  filter: LancamentosOriginFilter,
  originsByTransactionId: ReadonlyMap<string, TransactionOrigin>,
): T[] {
  if (filter === "all") {
    return transactions;
  }

  return transactions.filter((transaction) => {
    const origin = originsByTransactionId.get(transaction.id) ?? "manual";
    return origin === filter;
  });
}

/**
 * Applies type + origin quick filters after period/account scoping.
 */
export function applyLancamentosQuickFilters<
  T extends Pick<Transaction, "id" | "type">,
>(input: {
  transactions: T[];
  typeFilter: LancamentosTypeFilter;
  originFilter: LancamentosOriginFilter;
  originsByTransactionId: ReadonlyMap<string, TransactionOrigin>;
}): T[] {
  const byType = filterTransactionsByType(
    input.transactions,
    input.typeFilter,
  );
  return filterTransactionsByOrigin(
    byType,
    input.originFilter,
    input.originsByTransactionId,
  );
}

export function getLancamentosListEmptyCopy(input: {
  hasLoadedTransactions: boolean;
  searchTerm: string;
  typeFilter: LancamentosTypeFilter;
  originFilter: LancamentosOriginFilter;
  hasAccountFilter: boolean;
}): { title: string; description: string } {
  if (!input.hasLoadedTransactions) {
    return {
      title: "Nenhum lançamento encontrado",
      description:
        "Registre sua primeira movimentação ou importe um CSV do Nubank.",
    };
  }

  const hasSearch = Boolean(input.searchTerm.trim());
  const hasQuick =
    input.typeFilter !== "all" || input.originFilter !== "all";

  if (hasSearch || hasQuick) {
    return {
      title: "Nenhum lançamento encontrado para estes filtros",
      description:
        "Tente outro termo, limpe a busca ou ajuste tipo/origem, conta e período.",
    };
  }

  if (input.hasAccountFilter) {
    return {
      title: "Nenhum lançamento nesta conta",
      description: "Tente outra conta, cartão ou veja todas as contas.",
    };
  }

  return {
    title: "Nenhum lançamento neste período",
    description: "Tente outro mês ou veja todo o histórico.",
  };
}
