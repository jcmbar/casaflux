export type AccountType =
  | "checking"
  | "savings"
  | "cash"
  | "credit_card"
  | "investment";

export type AccountMode = "real" | "forecast";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  account_mode: AccountMode;
  balance: number;
  color: string | null;
  owner_user_id: string | null;
  family_id: string | null;
  is_family_shared: boolean;
  allow_family_view: boolean;
  allow_family_post: boolean;
  allow_family_edit: boolean;
  created_at: string;
  families?: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
}

export function isPersonalAccount(account: Pick<Account, "is_family_shared">) {
  return !account.is_family_shared;
}

export function isRealAccount(account: Pick<Account, "account_mode">) {
  return account.account_mode === "real";
}

export function isForecastAccount(account: Pick<Account, "account_mode">) {
  return account.account_mode === "forecast";
}

export function filterRealAccounts<T extends Pick<Account, "account_mode">>(
  accounts: T[],
): T[] {
  return accounts.filter(isRealAccount);
}

export function filterForecastAccounts<
  T extends Pick<Account, "account_mode">,
>(accounts: T[]): T[] {
  return accounts.filter(isForecastAccount);
}

export function canPostToAccount(
  account: Pick<
    Account,
    "is_family_shared" | "allow_family_post" | "owner_user_id"
  >,
  userId: string,
) {
  if (!account.is_family_shared) {
    return account.owner_user_id === userId;
  }

  return account.allow_family_post;
}

export function canEditAccount(
  account: Pick<
    Account,
    "is_family_shared" | "allow_family_edit" | "owner_user_id"
  >,
  userId: string,
  isAdmin: boolean,
) {
  if (!account.is_family_shared) {
    return account.owner_user_id === userId;
  }

  return isAdmin || account.allow_family_edit;
}
