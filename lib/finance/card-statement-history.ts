import {
  buildStatementCycle,
  compareIsoDates,
  formatFullBrDate,
  formatStatementPeriodLabel,
  getCreditCardBillingConfig,
  getCurrentStatementCycle,
  getStatementCycleForDate,
  getStatementCyclePaidByPaymentDate,
  getStatementSettlement,
  isPaymentAttributedToStatementCycle,
  STATEMENT_STATUS_LABELS,
  type CreditCardBillingConfig,
  type StatementCycle,
  type StatementSettlement,
  type StatementStatus,
} from "@/lib/finance/credit-card-billing";
import { INVOICE_PAYMENT_CARD_DESCRIPTION } from "@/lib/finance/lancamentos-filters";
import {
  buildStatementCompositionForAccount,
  type StatementComposition,
} from "@/lib/finance/statement-composition";
import type { Account } from "@/types/account";
import type { Transaction } from "@/types/transaction";

export type StatementPaymentDisplayStatus =
  | "manual_pending"
  | "imported"
  | "reconciled";

export const STATEMENT_PAYMENT_DISPLAY_STATUS_LABELS: Record<
  StatementPaymentDisplayStatus,
  string
> = {
  manual_pending: "Manual (aguardando importação)",
  imported: "Importado",
  reconciled: "Conciliado",
};

export type StatementPaymentHistoryItem = {
  /** Primary transaction id shown in the list (imported preferred when reconciled). */
  id: string;
  date: string;
  amount: number;
  sourceAccountId: string | null;
  sourceAccountName: string | null;
  origin: "manual" | "imported" | null;
  displayStatus: StatementPaymentDisplayStatus;
  /** Other leg of a reconciled pair, when present. */
  pairedTransactionId: string | null;
  pairedOrigin: "manual" | "imported" | null;
  notes: string | null;
  description: string;
};

export type CardStatementHistoryItem = {
  cycle: StatementCycle;
  periodLabel: string;
  dueDateLabel: string;
  settlement: StatementSettlement;
  status: StatementStatus;
  statusLabel: string;
  isCurrent: boolean;
};

export type CardStatementHistoryDetail = CardStatementHistoryItem & {
  cardAccountId: string;
  cardAccountName: string;
  payments: StatementPaymentHistoryItem[];
  composition: StatementComposition | null;
};

export type StatementHistoryTransaction = Pick<
  Transaction,
  | "id"
  | "amount"
  | "type"
  | "date"
  | "accountId"
  | "description"
  | "notes"
  | "linkedTransactionId"
  | "statementCycleId"
  | "invoicePaymentOrigin"
  | "reconciledWithTransactionId"
>;

export type StatementPaymentSourceLookup = {
  accountId: string;
  accountName: string | null;
  notes?: string | null;
};

/**
 * Discovers statement cycles for a card from activity + current open cycle.
 * Newest closing date first.
 */
export function discoverCardStatementCycles(input: {
  config: CreditCardBillingConfig;
  transactions: StatementHistoryTransaction[];
  cardAccountId: string;
  referenceDate: string;
}): StatementCycle[] {
  const cycleIds = new Set<string>();

  const current = getCurrentStatementCycle(input.config, input.referenceDate);
  cycleIds.add(current.cycleId);

  for (const transaction of input.transactions) {
    if (transaction.accountId !== input.cardAccountId) {
      continue;
    }

    if (transaction.statementCycleId) {
      cycleIds.add(transaction.statementCycleId.slice(0, 10));
      continue;
    }

    if (transaction.type === "expense" || transaction.type === "income") {
      const fromDate =
        transaction.type === "income"
          ? getStatementCyclePaidByPaymentDate(input.config, transaction.date)
          : getStatementCycleForDate(input.config, transaction.date);
      cycleIds.add(fromDate.cycleId);
    }
  }

  return [...cycleIds]
    .sort((left, right) => compareIsoDates(right, left))
    .map((cycleId) =>
      buildStatementCycle({
        closingDate: cycleId,
        closingDay: input.config.statementClosingDay,
        dueDay: input.config.statementDueDay,
      }),
    );
}

export function extractInvoicePaymentNotes(
  description: string,
  notes?: string | null,
): string | null {
  if (notes?.trim()) {
    return notes.trim();
  }

  const trimmed = description.trim();
  const marker = `${INVOICE_PAYMENT_CARD_DESCRIPTION} — `;
  if (trimmed.startsWith(marker)) {
    return trimmed.slice(marker.length).trim() || null;
  }

  const sourceMarker = `Pagamento fatura (origem) — ${INVOICE_PAYMENT_CARD_DESCRIPTION} — `;
  if (trimmed.startsWith(sourceMarker)) {
    return trimmed.slice(sourceMarker.length).trim() || null;
  }

  return null;
}

/**
 * Lists payments for a cycle without duplicating reconciled manual+imported pairs.
 * Reconciled pairs collapse to one row (imported preferred as primary).
 */
export function listStatementCyclePayments(input: {
  cardAccountId: string;
  config: CreditCardBillingConfig;
  cycle: StatementCycle;
  cardTransactions: StatementHistoryTransaction[];
  /** Linked source (expense) legs keyed by transaction id. */
  sourcesByTransactionId?: Map<string, StatementPaymentSourceLookup>;
}): StatementPaymentHistoryItem[] {
  const attributed = input.cardTransactions.filter((transaction) =>
    isPaymentAttributedToStatementCycle({
      transaction,
      accountId: input.cardAccountId,
      cycle: input.cycle,
      config: input.config,
    }),
  );

  const byId = new Map(attributed.map((transaction) => [transaction.id, transaction]));
  const consumed = new Set<string>();
  const items: StatementPaymentHistoryItem[] = [];

  const sorted = [...attributed].sort((left, right) => {
    const byDate = compareIsoDates(right.date, left.date);
    if (byDate !== 0) return byDate;
    return right.id.localeCompare(left.id);
  });

  for (const transaction of sorted) {
    if (consumed.has(transaction.id)) {
      continue;
    }

    const pairedId = transaction.reconciledWithTransactionId;
    const paired = pairedId ? byId.get(pairedId) ?? null : null;

    if (paired) {
      consumed.add(transaction.id);
      consumed.add(paired.id);

      const imported =
        transaction.invoicePaymentOrigin === "imported"
          ? transaction
          : paired.invoicePaymentOrigin === "imported"
            ? paired
            : transaction;
      const manual =
        imported.id === transaction.id ? paired : transaction;

      items.push(
        buildPaymentHistoryItem({
          primary: imported,
          paired: manual,
          displayStatus: "reconciled",
          sourcesByTransactionId: input.sourcesByTransactionId,
        }),
      );
      continue;
    }

    // Skip manual that is reconciled to a twin outside this attribution set —
    // the imported twin (if present) will represent the event; if imported is
    // missing from this cycle view, still show the manual as reconciled.
    if (
      transaction.reconciledWithTransactionId &&
      transaction.invoicePaymentOrigin === "manual"
    ) {
      consumed.add(transaction.id);
      items.push(
        buildPaymentHistoryItem({
          primary: transaction,
          paired: null,
          displayStatus: "reconciled",
          sourcesByTransactionId: input.sourcesByTransactionId,
        }),
      );
      continue;
    }

    consumed.add(transaction.id);

    const displayStatus: StatementPaymentDisplayStatus =
      transaction.invoicePaymentOrigin === "manual"
        ? "manual_pending"
        : "imported";

    items.push(
      buildPaymentHistoryItem({
        primary: transaction,
        paired: null,
        displayStatus,
        sourcesByTransactionId: input.sourcesByTransactionId,
      }),
    );
  }

  return items;
}

function buildPaymentHistoryItem(input: {
  primary: StatementHistoryTransaction;
  paired: StatementHistoryTransaction | null;
  displayStatus: StatementPaymentDisplayStatus;
  sourcesByTransactionId?: Map<string, StatementPaymentSourceLookup>;
}): StatementPaymentHistoryItem {
  const sourceTxId = input.primary.linkedTransactionId;
  const source = sourceTxId
    ? input.sourcesByTransactionId?.get(sourceTxId)
    : undefined;

  return {
    id: input.primary.id,
    date: input.primary.date.slice(0, 10),
    amount: Math.abs(Number(input.primary.amount)),
    sourceAccountId: source?.accountId ?? null,
    sourceAccountName: source?.accountName ?? null,
    origin: input.primary.invoicePaymentOrigin ?? null,
    displayStatus: input.displayStatus,
    pairedTransactionId: input.paired?.id ?? null,
    pairedOrigin: input.paired?.invoicePaymentOrigin ?? null,
    notes: extractInvoicePaymentNotes(
      input.primary.description,
      input.primary.notes ?? source?.notes,
    ),
    description: input.primary.description,
  };
}

/**
 * Builds the chronological statement list for a configured credit card.
 */
export function buildCardStatementHistory(input: {
  cardAccount: Pick<
    Account,
    "id" | "name" | "type" | "statement_closing_day" | "statement_due_day"
  >;
  transactions: StatementHistoryTransaction[];
  referenceDate: string;
}): CardStatementHistoryItem[] | null {
  const config = getCreditCardBillingConfig(input.cardAccount);
  if (!config) {
    return null;
  }

  const cycles = discoverCardStatementCycles({
    config,
    transactions: input.transactions,
    cardAccountId: input.cardAccount.id,
    referenceDate: input.referenceDate,
  });

  const currentId = getCurrentStatementCycle(
    config,
    input.referenceDate,
  ).cycleId;

  return cycles.map((cycle) => {
    const settlement = getStatementSettlement({
      accountId: input.cardAccount.id,
      config,
      cycle,
      transactions: input.transactions,
      referenceDate: input.referenceDate,
    });

    return {
      cycle,
      periodLabel: formatStatementPeriodLabel(cycle),
      dueDateLabel: formatFullBrDate(cycle.dueDate),
      settlement,
      status: settlement.status,
      statusLabel: STATEMENT_STATUS_LABELS[settlement.status],
      isCurrent: cycle.cycleId === currentId,
    };
  });
}

export function buildCardStatementHistoryDetail(input: {
  cardAccount: Pick<
    Account,
    "id" | "name" | "type" | "statement_closing_day" | "statement_due_day"
  >;
  cycleId: string;
  transactions: StatementHistoryTransaction[];
  referenceDate: string;
  sourcesByTransactionId?: Map<string, StatementPaymentSourceLookup>;
}): CardStatementHistoryDetail | null {
  const history = buildCardStatementHistory({
    cardAccount: input.cardAccount,
    transactions: input.transactions,
    referenceDate: input.referenceDate,
  });

  if (!history) {
    return null;
  }

  const item =
    history.find((entry) => entry.cycle.cycleId === input.cycleId.slice(0, 10)) ??
    null;

  if (!item) {
    const config = getCreditCardBillingConfig(input.cardAccount);
    if (!config) {
      return null;
    }

    const cycle = buildStatementCycle({
      closingDate: input.cycleId.slice(0, 10),
      closingDay: config.statementClosingDay,
      dueDay: config.statementDueDay,
    });
    const settlement = getStatementSettlement({
      accountId: input.cardAccount.id,
      config,
      cycle,
      transactions: input.transactions,
      referenceDate: input.referenceDate,
    });

    return {
      cycle,
      periodLabel: formatStatementPeriodLabel(cycle),
      dueDateLabel: formatFullBrDate(cycle.dueDate),
      settlement,
      status: settlement.status,
      statusLabel: STATEMENT_STATUS_LABELS[settlement.status],
      isCurrent:
        getCurrentStatementCycle(config, input.referenceDate).cycleId ===
        cycle.cycleId,
      cardAccountId: input.cardAccount.id,
      cardAccountName: input.cardAccount.name,
      payments: listStatementCyclePayments({
        cardAccountId: input.cardAccount.id,
        config,
        cycle,
        cardTransactions: input.transactions,
        sourcesByTransactionId: input.sourcesByTransactionId,
      }),
      composition: buildStatementCompositionForAccount({
        cardAccount: input.cardAccount,
        cycle,
        periodLabel: formatStatementPeriodLabel(cycle),
        transactions: input.transactions,
        settlement,
      }),
    };
  }

  const config = getCreditCardBillingConfig(input.cardAccount)!;

  return {
    ...item,
    cardAccountId: input.cardAccount.id,
    cardAccountName: input.cardAccount.name,
    payments: listStatementCyclePayments({
      cardAccountId: input.cardAccount.id,
      config,
      cycle: item.cycle,
      cardTransactions: input.transactions,
      sourcesByTransactionId: input.sourcesByTransactionId,
    }),
    composition: buildStatementCompositionForAccount({
      cardAccount: input.cardAccount,
      cycle: item.cycle,
      periodLabel: item.periodLabel,
      transactions: input.transactions,
      settlement: item.settlement,
    }),
  };
}

export type FaturasListFilter =
  | "all"
  | "current"
  | "open"
  | "partial"
  | "paid"
  | "overdue";

export const FATURAS_LIST_FILTERS: readonly FaturasListFilter[] = [
  "all",
  "current",
  "open",
  "partial",
  "paid",
  "overdue",
] as const;

export const FATURAS_LIST_FILTER_LABELS: Record<FaturasListFilter, string> = {
  all: "Todas",
  current: "Atual",
  open: "Aberta",
  partial: "Parcial",
  paid: "Paga",
  overdue: "Atrasada",
};

const FATURAS_LIST_FILTER_SET = new Set<string>(FATURAS_LIST_FILTERS);

export function buildFaturasHref(input: {
  accountId: string;
  cycleId?: string | null;
  status?: FaturasListFilter | null;
}): string {
  const params = new URLSearchParams();
  params.set("account", input.accountId);
  if (input.cycleId) {
    params.set("cycle", input.cycleId.slice(0, 10));
  }
  if (input.status && input.status !== "all") {
    params.set("status", input.status);
  }
  return `/faturas?${params.toString()}`;
}

/**
 * Parses `?status=` from the faturas URL. Unknown values fall back to `all`.
 */
export function parseFaturasListFilter(
  value: string | null | undefined,
): FaturasListFilter {
  if (!value) {
    return "all";
  }

  const normalized = value.trim().toLowerCase();
  if (FATURAS_LIST_FILTER_SET.has(normalized)) {
    return normalized as FaturasListFilter;
  }

  return "all";
}

/**
 * Filters the statement history list. Domain statuses map 1:1;
 * `current` uses `isCurrent` (open accumulating cycle for referenceDate).
 */
export function filterCardStatementHistory(
  items: CardStatementHistoryItem[],
  filter: FaturasListFilter,
): CardStatementHistoryItem[] {
  switch (filter) {
    case "all":
      return items;
    case "current":
      return items.filter((item) => item.isCurrent);
    case "open":
    case "partial":
    case "paid":
    case "overdue":
      return items.filter((item) => item.status === filter);
    default:
      return items;
  }
}

export function getFaturasListEmptyMessage(input: {
  filter: FaturasListFilter;
  hasAnyStatements: boolean;
}): string {
  if (!input.hasAnyStatements) {
    return "Ainda não há ciclos para este cartão.";
  }

  switch (input.filter) {
    case "current":
      return "Nenhuma fatura atual encontrada para este cartão.";
    case "open":
      return "Nenhuma fatura aberta (ainda não vencida) neste histórico.";
    case "partial":
      return "Nenhuma fatura parcialmente paga neste histórico.";
    case "paid":
      return "Nenhuma fatura quitada neste histórico.";
    case "overdue":
      return "Nenhuma fatura atrasada neste histórico.";
    case "all":
    default:
      return "Nenhuma fatura para exibir.";
  }
}
