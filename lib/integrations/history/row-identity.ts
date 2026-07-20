import { amountToFingerprintCents } from "../core/normalize";
import type { NormalizedImportRow } from "../types";

export function buildImportRowIdentityKey(
  row: NormalizedImportRow,
  accountId: string,
): string {
  if (row.source === "nubank_credit_card") {
    return row.externalFingerprint;
  }

  if (row.externalId) {
    const amountCents = amountToFingerprintCents(row.amount);
    return `${row.source}:${accountId}:${row.externalId}:${row.direction}:${amountCents}:${row.kind}`;
  }

  const amountCents = amountToFingerprintCents(row.amount);
  return `${row.externalFingerprint}:${accountId}:${row.direction}:${amountCents}:${row.kind}`;
}
