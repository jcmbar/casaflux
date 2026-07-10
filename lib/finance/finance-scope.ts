import type { Account } from "@/types/account";

/**
 * View scope for Dashboard and Lançamentos.
 *
 * - With active family: user's personal accounts + family-shared accounts of that family.
 * - Without active family: only the user's personal accounts (no family-shared rows).
 * - Switching active family swaps which family-shared accounts/transactions appear.
 *
 * RLS still limits what is fetched; this layer keeps the UI context coherent when the
 * user belongs to multiple families.
 */
export type FinanceViewScope = {
  userId: string;
  activeFamilyId: string | null;
};

export function getFinanceViewScope({
  userId,
  activeFamilyId,
}: {
  userId: string;
  activeFamilyId: string | null;
}): FinanceViewScope {
  return { userId, activeFamilyId };
}

type AccountScopeFields = Pick<
  Account,
  "id" | "is_family_shared" | "owner_user_id" | "family_id"
>;

export function isAccountInFinanceScope(
  account: Pick<Account, "is_family_shared" | "owner_user_id" | "family_id">,
  scope: FinanceViewScope,
): boolean {
  if (!account.is_family_shared) {
    return account.owner_user_id === scope.userId;
  }

  if (!scope.activeFamilyId) {
    return false;
  }

  return account.family_id === scope.activeFamilyId;
}

export function filterAccountsByFinanceScope<T extends AccountScopeFields>(
  accounts: T[],
  scope: FinanceViewScope,
): T[] {
  return accounts.filter((account) => isAccountInFinanceScope(account, scope));
}

export function getScopedAccountIds(
  accounts: AccountScopeFields[],
  scope: FinanceViewScope,
): string[] {
  return filterAccountsByFinanceScope(accounts, scope).map((account) => account.id);
}

export function filterTransactionsByAccountIds<
  T extends { account_id: string },
>(transactions: T[], accountIds: readonly string[]): T[] {
  if (accountIds.length === 0) {
    return [];
  }

  const allowed = new Set(accountIds);
  return transactions.filter((transaction) => allowed.has(transaction.account_id));
}

export function isAccountIdInFinanceScope(
  accountId: string,
  accounts: AccountScopeFields[],
  scope: FinanceViewScope,
): boolean {
  const account = accounts.find((item) => item.id === accountId);
  return account ? isAccountInFinanceScope(account, scope) : false;
}
