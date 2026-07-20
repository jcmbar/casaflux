import type { TransactionType } from "@/types/transaction";
import type { ImportPreviewRow, NormalizedImportKind } from "../types";
import { getConfirmedCategoryForCommit } from "../categories/category-suggestion-service";

export type CommitImportTransactionDraft = {
  accountId: string;
  type: TransactionType;
  amount: number;
  description: string;
  transactionDate: string;
  categoryId?: string | null;
};

export type CommitImportRowPayload = {
  sourceLine: number;
  identityKey: string;
  externalFingerprint: string;
  externalId: string | null;
  kind: NormalizedImportKind;
  rowDate: string;
  amount: number;
  direction: "in" | "out";
  description: string;
  transactions: CommitImportTransactionDraft[];
};

const NON_COMMITABLE_REVIEW_STATUSES = new Set([
  "invalid",
  "already_imported",
  "possible_duplicate",
  "possible_historical_conflict",
]);

export function mapImportRowToTransactions(
  row: ImportPreviewRow,
  targetAccountId: string,
  invoiceSourceAccountId?: string,
): CommitImportTransactionDraft[] {
  const base = {
    amount: row.amount,
    transactionDate: row.date,
  };

  if (row.kind === "card_invoice_payment") {
    if (!invoiceSourceAccountId) {
      throw new Error("Conta de origem obrigatória para pagamento de fatura.");
    }

    return [
      {
        ...base,
        accountId: invoiceSourceAccountId,
        type: "expense",
        description: `Pagamento fatura (origem) — ${row.description}`,
      },
      {
        ...base,
        accountId: targetAccountId,
        type: "income",
        description: row.description,
      },
    ];
  }

  if (row.source === "nubank_credit_card") {
    return [
      {
        ...base,
        accountId: targetAccountId,
        type: row.direction === "in" ? "income" : "expense",
        description: row.description,
      },
    ];
  }

  const checkingType: TransactionType = row.direction === "in" ? "income" : "expense";

  return [
    {
      ...base,
      accountId: targetAccountId,
      type: checkingType,
      description: row.description,
    },
  ];
}

export function isImportRowCommittable(
  row: ImportPreviewRow,
  invoiceSourceAccounts: Record<number, string>,
): boolean {
  if (row.historicalStatus !== "new") {
    return false;
  }

  if (NON_COMMITABLE_REVIEW_STATUSES.has(row.reviewStatus)) {
    return false;
  }

  if (row.kind === "unknown") {
    return false;
  }

  if (row.kind === "card_invoice_payment") {
    return Boolean(invoiceSourceAccounts[row.sourceLine]);
  }

  if (row.reviewStatus === "needs_account") {
    return false;
  }

  return row.reviewStatus === "ready";
}

export function getCommittableImportRows(
  rows: ImportPreviewRow[],
  invoiceSourceAccounts: Record<number, string>,
): ImportPreviewRow[] {
  return rows.filter((row) => isImportRowCommittable(row, invoiceSourceAccounts));
}

export function getCommitImportValidationError(input: {
  previewRows: ImportPreviewRow[];
  invoiceSourceAccounts: Record<number, string>;
  targetAccountId: string;
  contentHash: string;
  source: string | null;
}): string | null {
  if (!input.source) {
    return "Fonte de importação inválida.";
  }

  if (!input.targetAccountId) {
    return "Selecione a conta de destino.";
  }

  if (!input.contentHash) {
    return "Hash do arquivo ausente.";
  }

  const committableRows = getCommittableImportRows(
    input.previewRows,
    input.invoiceSourceAccounts,
  );

  if (committableRows.length === 0) {
    return "Não há linhas novas e prontas para importar.";
  }

  for (const row of committableRows) {
    if (row.kind === "card_invoice_payment" && !input.invoiceSourceAccounts[row.sourceLine]) {
      return "Selecione a conta de origem do pagamento de fatura.";
    }
  }

  return null;
}

function applyConfirmedCategoryToTransactions(
  row: ImportPreviewRow,
  transactions: CommitImportTransactionDraft[],
): CommitImportTransactionDraft[] {
  const categoryId = getConfirmedCategoryForCommit(row);
  if (!categoryId) {
    return transactions;
  }

  if (row.kind === "card_invoice_payment") {
    return transactions.map((transaction, index) =>
      index === 0 ? { ...transaction, categoryId } : transaction,
    );
  }

  return transactions.map((transaction) => ({ ...transaction, categoryId }));
}

export function buildCommitImportRowPayload(
  row: ImportPreviewRow,
  targetAccountId: string,
  identityKey: string,
  invoiceSourceAccounts: Record<number, string>,
): CommitImportRowPayload {
  const invoiceSourceAccountId = invoiceSourceAccounts[row.sourceLine];
  const transactions = applyConfirmedCategoryToTransactions(
    row,
    mapImportRowToTransactions(row, targetAccountId, invoiceSourceAccountId),
  );

  return {
    sourceLine: row.sourceLine,
    identityKey,
    externalFingerprint: row.externalFingerprint,
    externalId: row.externalId,
    kind: row.kind,
    rowDate: row.date,
    amount: row.amount,
    direction: row.direction,
    description: row.description,
    transactions,
  };
}

export function toRpcCommitRowPayload(row: CommitImportRowPayload) {
  return {
    source_line: row.sourceLine,
    identity_key: row.identityKey,
    external_fingerprint: row.externalFingerprint,
    external_id: row.externalId,
    kind: row.kind,
    row_date: row.rowDate,
    amount: row.amount,
    direction: row.direction,
    description: row.description,
    transactions: row.transactions.map((transaction) => ({
      account_id: transaction.accountId,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      transaction_date: transaction.transactionDate,
      category_id: transaction.categoryId ?? null,
    })),
  };
}
