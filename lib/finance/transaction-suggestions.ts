import type { Account } from "@/types/account";
import type { Transaction, TransactionType } from "@/types/transaction";

export type SuggestionCategory = {
  id: string;
  name: string;
  type: TransactionType;
};

export type SuggestionSource =
  | "similar"
  | "last_user"
  | "frequency"
  | "keyword"
  | "default";

export type TransactionDraftSuggestion = {
  description: string;
  categoryId: string | null;
  accountId: string | null;
  confidence: number;
  source: SuggestionSource;
};

const KEYWORD_CATEGORY_HINTS: Array<{ tokens: string[]; categoryNames: string[] }> = [
  { tokens: ["mercado", "super", "extra", "padaria", "ifood"], categoryNames: ["Alimentação"] },
  { tokens: ["uber", "99", "gasolina", "combust"], categoryNames: ["Transporte"] },
  { tokens: ["farmacia", "farmácia", "droga"], categoryNames: ["Saúde"] },
];

const SIMILARITY_THRESHOLD = 0.5;

export function normalizeDescription(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeDescription(value).split(/\s+/).filter(Boolean);
}

export function descriptionSimilarity(a: string, b: string): number {
  const left = normalizeDescription(a);
  const right = normalizeDescription(b);

  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.85;

  const leftTokens = new Set(tokenize(a));
  const rightTokens = new Set(tokenize(b));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union > 0 ? shared / union : 0;
}

function isValidAccount(accountId: string | null, accounts: Account[]): boolean {
  return Boolean(accountId && accounts.some((account) => account.id === accountId));
}

function isValidCategory(
  categoryId: string | null,
  categories: SuggestionCategory[],
  type: TransactionType,
): boolean {
  return Boolean(
    categoryId &&
      categories.some(
        (category) => category.id === categoryId && category.type === type,
      ),
  );
}

function findCategoryByNames(
  categories: SuggestionCategory[],
  names: string[],
  type: TransactionType,
) {
  const normalizedNames = names.map((name) => normalizeDescription(name));

  return categories.find(
    (category) =>
      category.type === type &&
      normalizedNames.some(
        (name) => normalizeDescription(category.name) === name,
      ),
  );
}

function findCategoryFromKeywords(
  description: string,
  categories: SuggestionCategory[],
  type: TransactionType,
) {
  const normalized = normalizeDescription(description);
  if (!normalized) return null;

  for (const hint of KEYWORD_CATEGORY_HINTS) {
    if (!hint.tokens.some((token) => normalized.includes(token))) continue;

    const match = findCategoryByNames(categories, hint.categoryNames, type);
    if (match) return match;
  }

  return null;
}

export function findBestSimilarTransaction(
  userHistory: Transaction[],
  description: string,
): Transaction | null {
  const trimmed = description.trim();
  if (!trimmed || userHistory.length === 0) return null;

  let best: Transaction | null = null;
  let bestScore = 0;

  for (const transaction of userHistory) {
    const score = descriptionSimilarity(trimmed, transaction.description);
    if (score > bestScore) {
      bestScore = score;
      best = transaction;
    }
  }

  return bestScore >= SIMILARITY_THRESHOLD ? best : null;
}

export function findLastUserTransaction(
  userHistory: Transaction[],
): Transaction | null {
  return userHistory[0] ?? null;
}

function suggestAccountFromFrequency(
  userHistory: Transaction[],
  accounts: Account[],
): string | null {
  const frequency = new Map<string, number>();

  for (const transaction of userHistory.slice(0, 30)) {
    frequency.set(
      transaction.accountId,
      (frequency.get(transaction.accountId) ?? 0) + 1,
    );
  }

  let bestAccountId: string | null = null;
  let bestCount = 0;

  for (const [accountId, count] of frequency.entries()) {
    if (count > bestCount && accounts.some((account) => account.id === accountId)) {
      bestAccountId = accountId;
      bestCount = count;
    }
  }

  return bestAccountId ?? accounts[0]?.id ?? null;
}

function suggestCategoryFromFrequency(
  userHistory: Transaction[],
  categories: SuggestionCategory[],
  type: TransactionType,
  accountId: string | null,
): string | null {
  const filtered = categories.filter((category) => category.type === type);
  if (filtered.length === 0) return null;

  const frequency = new Map<string, number>();

  for (const transaction of userHistory) {
    if (!transaction.categoryId) continue;
    if (accountId && transaction.accountId !== accountId) continue;

    frequency.set(
      transaction.categoryId,
      (frequency.get(transaction.categoryId) ?? 0) + 1,
    );
  }

  let bestCategoryId: string | null = null;
  let bestCount = 0;

  for (const [categoryId, count] of frequency.entries()) {
    if (count > bestCount && filtered.some((category) => category.id === categoryId)) {
      bestCategoryId = categoryId;
      bestCount = count;
    }
  }

  if (bestCategoryId) return bestCategoryId;

  const fromKeywords = findCategoryFromKeywords("", filtered, type);
  return fromKeywords?.id ?? filtered[0]?.id ?? null;
}

function buildSuggestionFromTransaction(
  transaction: Transaction,
  description: string,
  categories: SuggestionCategory[],
  accounts: Account[],
  type: TransactionType,
  userHistory: Transaction[],
  source: SuggestionSource,
  confidence: number,
): TransactionDraftSuggestion {
  const accountId = isValidAccount(transaction.accountId, accounts)
    ? transaction.accountId
    : suggestAccountFromFrequency(userHistory, accounts);

  const categoryId = isValidCategory(transaction.categoryId, categories, type)
    ? transaction.categoryId
    : suggestCategoryFromFrequency(userHistory, categories, type, accountId);

  return {
    description: description.trim() || transaction.description,
    accountId,
    categoryId,
    confidence,
    source,
  };
}

export function suggestTransactionDraft({
  type,
  description,
  categories,
  accounts,
  history,
  userId,
}: {
  type: TransactionType;
  description: string;
  categories: SuggestionCategory[];
  accounts: Account[];
  history: Transaction[];
  userId: string;
}): TransactionDraftSuggestion {
  const userHistory = history.filter(
    (transaction) =>
      transaction.createdBy === userId && transaction.type === type,
  );

  const trimmedDescription = description.trim();

  if (trimmedDescription) {
    const similar = findBestSimilarTransaction(userHistory, trimmedDescription);

    if (similar) {
      const score = descriptionSimilarity(trimmedDescription, similar.description);

      return buildSuggestionFromTransaction(
        similar,
        trimmedDescription,
        categories,
        accounts,
        type,
        userHistory,
        "similar",
        Math.min(0.5 + score * 0.5, 1),
      );
    }
  } else {
    const lastUser = findLastUserTransaction(userHistory);

    if (lastUser) {
      return buildSuggestionFromTransaction(
        lastUser,
        "",
        categories,
        accounts,
        type,
        userHistory,
        "last_user",
        0.65,
      );
    }
  }

  const accountId = suggestAccountFromFrequency(userHistory, accounts);
  const categoryId = suggestCategoryFromFrequency(
    userHistory,
    categories,
    type,
    accountId,
  );

  const fromKeywords = trimmedDescription
    ? findCategoryFromKeywords(trimmedDescription, categories, type)
    : null;

  const resolvedCategoryId = fromKeywords?.id ?? categoryId;
  const source: SuggestionSource = fromKeywords ? "keyword" : "frequency";

  let suggestedDescription = trimmedDescription;

  if (!suggestedDescription && resolvedCategoryId) {
    const category = categories.find((item) => item.id === resolvedCategoryId);
    if (category) suggestedDescription = category.name;
  }

  return {
    description: suggestedDescription,
    categoryId: resolvedCategoryId,
    accountId,
    confidence: trimmedDescription ? 0.35 : 0.25,
    source,
  };
}

export function getDefaultDescriptionForType(type: TransactionType): string {
  return type === "income" ? "Receita" : "Despesa";
}
