/**
 * Local UI preferences per authenticated user (localStorage).
 * Same persistence style as `casaflux:active-family-id`.
 */

const PREFERRED_ACCOUNT_KEY_PREFIX = "casaflux:preferred-account-id:";
const PREFERRED_ACCOUNT_FILTER_KEY_PREFIX =
  "casaflux:preferred-account-filter:";
const HIDE_AMOUNTS_KEY_PREFIX = "casaflux:hide-amounts:";

function preferredAccountKey(userId: string): string {
  return `${PREFERRED_ACCOUNT_KEY_PREFIX}${userId}`;
}

function preferredAccountFilterKey(userId: string): string {
  return `${PREFERRED_ACCOUNT_FILTER_KEY_PREFIX}${userId}`;
}

function hideAmountsKey(userId: string): string {
  return `${HIDE_AMOUNTS_KEY_PREFIX}${userId}`;
}

export function getPreferredAccountId(userId: string | null | undefined): string | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(preferredAccountKey(userId));
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function setPreferredAccountId(
  userId: string | null | undefined,
  accountId: string | null,
): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const key = preferredAccountKey(userId);
    if (!accountId) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, accountId);
  } catch {
    // Ignore quota / private mode failures.
  }
}

/** Lançamentos list Conta filter (`all` or account id). */
export function getPreferredAccountFilter(
  userId: string | null | undefined,
): string | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(preferredAccountFilterKey(userId));
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function setPreferredAccountFilter(
  userId: string | null | undefined,
  filter: string | null,
): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const key = preferredAccountFilterKey(userId);
    if (!filter) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, filter);
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function getHideAmounts(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(hideAmountsKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function setHideAmounts(
  userId: string | null | undefined,
  hidden: boolean,
): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const key = hideAmountsKey(userId);
    if (hidden) {
      window.localStorage.setItem(key, "1");
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore quota / private mode failures.
  }
}

/**
 * Picks the user's favorite account when it is still postable; otherwise the
 * first postable account (current alphabetical default).
 */
export function resolveDefaultAccountId(input: {
  preferredId: string | null | undefined;
  postableAccountIds: readonly string[];
}): string {
  const preferred = input.preferredId?.trim() || null;
  if (preferred && input.postableAccountIds.includes(preferred)) {
    return preferred;
  }
  return input.postableAccountIds[0] ?? "";
}
