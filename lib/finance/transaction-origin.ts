export type TransactionOrigin = "manual" | "imported";

export const TRANSACTION_ORIGIN_LABELS: Record<TransactionOrigin, string> = {
  manual: "Manual",
  imported: "Importado",
};

export type ImportBatchRowOriginFields = {
  transaction_id?: string | null;
  linked_transaction_id?: string | null;
};

/**
 * Collects transaction ids created by CSV/import commit.
 * Both primary and linked legs (e.g. invoice payment twins) count as imported.
 */
export function collectImportedTransactionIds(
  rows: readonly ImportBatchRowOriginFields[],
): Set<string> {
  const ids = new Set<string>();

  for (const row of rows) {
    if (row.transaction_id) {
      ids.add(row.transaction_id);
    }
    if (row.linked_transaction_id) {
      ids.add(row.linked_transaction_id);
    }
  }

  return ids;
}

/**
 * Origin is independent from transaction type (expense/income/transfer).
 * Manual is the default when there is no import_batch_rows link.
 */
export function resolveTransactionOrigin(
  transactionId: string,
  importedTransactionIds: ReadonlySet<string>,
): TransactionOrigin {
  return importedTransactionIds.has(transactionId) ? "imported" : "manual";
}

export function getTransactionOriginLabel(origin: TransactionOrigin): string {
  return TRANSACTION_ORIGIN_LABELS[origin];
}

export function getTransactionOriginBadgeClass(origin: TransactionOrigin): string {
  if (origin === "imported") {
    return "border-amber-500/20 bg-amber-500/5 text-amber-800 dark:text-amber-200";
  }

  return "border-border bg-muted/30 text-muted-foreground";
}

export function getTransactionOriginBadgeProps(origin: TransactionOrigin): {
  label: string;
  className: string;
  origin: TransactionOrigin;
} {
  return {
    origin,
    label: getTransactionOriginLabel(origin),
    className: getTransactionOriginBadgeClass(origin),
  };
}
