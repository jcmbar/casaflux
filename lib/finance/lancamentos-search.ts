import { ACCOUNT_TYPE_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Account } from "@/types/account";
import type { Transaction, TransactionType } from "@/types/transaction";

import {
  detectInvoicePaymentSignal,
  getAccountKindLabel,
  getInvoicePaymentLabel,
} from "./lancamentos-filters";

/** Debounce for auto-apply while typing (hybrid UX). */
export const LANCAMENTOS_SEARCH_DEBOUNCE_MS = 350;

export type LancamentosSearchCategoryLookup = {
  id: string;
  name: string;
};

export type LancamentosSearchAccountLookup = Pick<
  Account,
  "id" | "name" | "type"
>;

export type LancamentosSearchLookups = {
  categoriesById: ReadonlyMap<string, LancamentosSearchCategoryLookup>;
  accountsById: ReadonlyMap<string, LancamentosSearchAccountLookup>;
};

/**
 * Client-side search document for a transaction.
 * Keep field assembly here so a future server-side search can reuse the same tokens.
 */
export type LancamentosSearchDocument = {
  transactionId: string;
  /** Normalized, space-joined haystack used for substring matching. */
  haystack: string;
};

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSearchFromSearchParams(
  value: string | null | undefined,
): string {
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

export function normalizeAppliedSearchTerm(term: string): string {
  return term.trim();
}

export function formatAmountSearchTokens(amount: number): string[] {
  const absolute = Math.abs(amount);
  const fixed = absolute.toFixed(2);
  const [whole, cents] = fixed.split(".");

  return [
    formatCurrency(absolute),
    fixed,
    `${whole},${cents}`,
    String(absolute),
    whole,
  ];
}

function typeSearchTokens(type: TransactionType): string[] {
  return [type, TRANSACTION_TYPE_LABELS[type]];
}

function dateSearchTokens(date: string): string[] {
  const tokens = [date];

  try {
    tokens.push(formatDate(date));
    const [year, month, day] = date.slice(0, 10).split("-");
    if (year && month && day) {
      tokens.push(`${day}/${month}/${year}`);
      tokens.push(`${day}-${month}-${year}`);
    }
  } catch {
    // ignore invalid dates in search tokens
  }

  return tokens;
}

export function buildTransactionSearchTokens(
  transaction: Pick<
    Transaction,
    "id" | "description" | "amount" | "type" | "categoryId" | "accountId" | "date"
  >,
  lookups: LancamentosSearchLookups,
): string[] {
  const account = lookups.accountsById.get(transaction.accountId);
  const category = transaction.categoryId
    ? lookups.categoriesById.get(transaction.categoryId)
    : null;

  const invoiceLabel = getInvoicePaymentLabel(
    detectInvoicePaymentSignal({
      description: transaction.description,
      accountType: account?.type,
    }),
  );

  const tokens: string[] = [
    transaction.description,
    ...typeSearchTokens(transaction.type),
    ...formatAmountSearchTokens(transaction.amount),
    ...dateSearchTokens(transaction.date),
    category?.name ?? "Sem categoria",
    account?.name ?? "Conta",
    getAccountKindLabel(account),
  ];

  if (account) {
    tokens.push(ACCOUNT_TYPE_LABELS[account.type]);
  }

  if (invoiceLabel) {
    tokens.push(invoiceLabel);
  }

  return tokens.filter(Boolean);
}

export function buildTransactionSearchDocument(
  transaction: Pick<
    Transaction,
    "id" | "description" | "amount" | "type" | "categoryId" | "accountId" | "date"
  >,
  lookups: LancamentosSearchLookups,
): LancamentosSearchDocument {
  const haystack = normalizeSearchText(
    buildTransactionSearchTokens(transaction, lookups).join(" "),
  );

  return {
    transactionId: transaction.id,
    haystack,
  };
}

export function buildTransactionSearchIndex<
  T extends Pick<
    Transaction,
    "id" | "description" | "amount" | "type" | "categoryId" | "accountId" | "date"
  >,
>(transactions: T[], lookups: LancamentosSearchLookups): Map<string, string> {
  const index = new Map<string, string>();

  for (const transaction of transactions) {
    const document = buildTransactionSearchDocument(transaction, lookups);
    index.set(document.transactionId, document.haystack);
  }

  return index;
}

export function transactionMatchesSearch(
  haystack: string,
  rawQuery: string,
): boolean {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return true;
  }

  return haystack.includes(query);
}

/**
 * Filters transactions by a free-text query against a prebuilt search index.
 * Empty/whitespace query returns the input list unchanged.
 */
export function filterTransactionsBySearch<
  T extends Pick<Transaction, "id">,
>(
  transactions: T[],
  rawQuery: string,
  searchIndex: ReadonlyMap<string, string>,
): T[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return transactions;
  }

  return transactions.filter((transaction) => {
    const haystack = searchIndex.get(transaction.id) ?? "";
    return haystack.includes(query);
  });
}
