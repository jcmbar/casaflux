import { ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import type { Account, AccountType } from "@/types/account";

import {
  resolveAccountIdentity,
  resolveInstitutionFromName,
  type AccountIdentityInput,
} from "./institutions";

/**
 * Text label for native <select> options (HTML cannot render React icons).
 * Keeps institution hint when resolved.
 */
export function formatAccountSelectLabel(
  account: AccountIdentityInput & {
    account_mode?: string | null;
    is_family_shared?: boolean | null;
  },
  options?: { includeType?: boolean; includeScope?: boolean },
): string {
  const identity = resolveAccountIdentity(account);
  const parts = [account.name];

  if (identity.isKnownInstitution) {
    parts.push(identity.institution.name);
  }

  if (options?.includeType && account.type) {
    parts.push(ACCOUNT_TYPE_LABELS[account.type as AccountType]);
  }

  if (account.account_mode === "forecast") {
    parts.push("Provisão");
  }

  if (options?.includeScope && account.is_family_shared != null) {
    parts.push(account.is_family_shared ? "familiar" : "pessoal");
  }

  // Avoid "Nubank · Nubank" when the account name already is the brand.
  const unique = parts.filter(
    (part, index) =>
      index === 0 ||
      normalizeLoose(part) !== normalizeLoose(parts[0] ?? ""),
  );

  return unique.join(" · ");
}

function normalizeLoose(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function resolveInstitutionIdForAccount(
  account: Pick<Account, "name"> | AccountIdentityInput,
): string {
  return resolveInstitutionFromName(account.name).id;
}
