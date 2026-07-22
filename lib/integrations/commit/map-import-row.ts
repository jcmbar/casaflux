import type { TransactionType } from "@/types/transaction";
import type { ImportPreviewRow, NormalizedImportKind } from "../types";
import { getConfirmedCategoryForCommit } from "../categories/category-suggestion-service";
import type { CardStatementCycleRecord } from "@/lib/finance/card-statement-cycles";
import type { CreditCardBillingConfig } from "@/lib/finance/credit-card-billing";
import { resolveMaterializedImportStatementFileCycle } from "../invoice-payment/infer-import-statement-closing";
import {
  getInvoicePaymentCycleTargetSelection,
  resolveInvoicePaymentCycleTarget,
  type InvoicePaymentCycleResolveContext,
  type InvoicePaymentCycleTargetSelection,
} from "../invoice-payment/invoice-payment-cycle-target";
import {
  getInvoicePaymentImportMode,
  type InvoicePaymentImportMode,
} from "../invoice-payment/resolve-invoice-payment";

export type CommitImportTransactionDraft = {
  accountId: string;
  type: TransactionType;
  amount: number;
  description: string;
  transactionDate: string;
  categoryId?: string | null;
  /** Closing-date ISO for credit-card invoice payment legs (legacy). */
  statementCycleId?: string | null;
  /** Preferred invoice linkage: due date ISO chosen at import/retarget. */
  statementDueDate?: string | null;
  /** Tags invoice payment legs for future manual↔imported reconciliation. */
  invoicePaymentOrigin?: "manual" | "imported" | null;
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
  billingConfig?: CreditCardBillingConfig | null,
  invoicePaymentMode: InvoicePaymentImportMode = "payment",
  invoicePaymentCycleTargets: Record<
    number,
    InvoicePaymentCycleTargetSelection
  > = {},
  cycleContext?: InvoicePaymentCycleResolveContext | null,
): CommitImportTransactionDraft[] {
  const base = {
    amount: row.amount,
    transactionDate: row.date,
  };

  if (row.kind === "card_invoice_payment" && invoicePaymentMode === "common") {
    return [
      {
        ...base,
        accountId: targetAccountId,
        type: "income",
        description: row.description,
      },
    ];
  }

  if (row.kind === "card_invoice_payment") {
    if (!invoiceSourceAccountId) {
      throw new Error("Conta de origem obrigatória para pagamento de fatura.");
    }

    const resolved = billingConfig
      ? resolveInvoicePaymentCycleTarget(
          billingConfig,
          row.date,
          getInvoicePaymentCycleTargetSelection(
            invoicePaymentCycleTargets,
            row.sourceLine,
          ),
          cycleContext,
        )
      : null;
    const statementCycleId = resolved?.cycleId ?? null;
    const statementDueDate = resolved?.dueDate?.slice(0, 10) ?? null;

    return [
      {
        ...base,
        accountId: invoiceSourceAccountId,
        type: "expense",
        description: `Pagamento fatura (origem) — ${row.description}`,
        statementCycleId,
        statementDueDate,
        invoicePaymentOrigin: "imported",
      },
      {
        ...base,
        accountId: targetAccountId,
        type: "income",
        description: row.description,
        statementCycleId,
        statementDueDate,
        invoicePaymentOrigin: "imported",
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

  const checkingType: TransactionType =
    row.direction === "in" ? "income" : "expense";

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
  invoicePaymentModes: Record<number, InvoicePaymentImportMode> = {},
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
    const mode = getInvoicePaymentImportMode(
      invoicePaymentModes,
      row.sourceLine,
    );
    if (mode === "common") {
      return true;
    }
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
  invoicePaymentModes: Record<number, InvoicePaymentImportMode> = {},
): ImportPreviewRow[] {
  return rows.filter((row) =>
    isImportRowCommittable(row, invoiceSourceAccounts, invoicePaymentModes),
  );
}

export function getCommitImportValidationError(input: {
  previewRows: ImportPreviewRow[];
  invoiceSourceAccounts: Record<number, string>;
  targetAccountId: string;
  contentHash: string;
  source: string | null;
  invoicePaymentModes?: Record<number, InvoicePaymentImportMode>;
  /**
   * Legacy full cycle. Prefer `statementDueDate` + `statementClosingDate` +
   * billing/history inputs so closing can be materialized via inference.
   */
  statementFileCycle?: {
    closingDate: string;
    dueDate: string;
  } | null;
  statementDueDate?: string | null;
  statementClosingDate?: string | null;
  confirmLowConfidenceClosing?: boolean;
  billingConfig?: CreditCardBillingConfig | null;
  importedStatementCycles?: readonly CardStatementCycleRecord[];
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

  if (input.source === "nubank_credit_card") {
    const dueDate =
      input.statementDueDate?.slice(0, 10) ||
      input.statementFileCycle?.dueDate?.slice(0, 10) ||
      "";
    const userClosingDate =
      input.statementClosingDate?.slice(0, 10) ||
      input.statementFileCycle?.closingDate?.slice(0, 10) ||
      null;

    const materialized = resolveMaterializedImportStatementFileCycle({
      dueDate,
      userClosingDate,
      billingConfig: input.billingConfig,
      importedCycles: input.importedStatementCycles,
      confirmLowConfidenceClosing: input.confirmLowConfidenceClosing,
    });

    if (!materialized.ok) {
      return materialized.message;
    }
  }

  const modes = input.invoicePaymentModes ?? {};

  for (const row of input.previewRows) {
    if (row.historicalStatus !== "new") {
      continue;
    }

    if (NON_COMMITABLE_REVIEW_STATUSES.has(row.reviewStatus)) {
      continue;
    }

    if (row.kind !== "card_invoice_payment") {
      continue;
    }

    const mode = getInvoicePaymentImportMode(modes, row.sourceLine);
    if (mode === "payment" && !input.invoiceSourceAccounts[row.sourceLine]) {
      return "Selecione a conta de origem do pagamento de fatura.";
    }
  }

  const committableRows = getCommittableImportRows(
    input.previewRows,
    input.invoiceSourceAccounts,
    modes,
  );

  if (committableRows.length === 0) {
    const alreadyImportedCount = input.previewRows.filter(
      (row) => row.historicalStatus === "already_imported",
    ).length;

    if (
      alreadyImportedCount > 0 &&
      input.previewRows.every((row) => row.historicalStatus === "already_imported")
    ) {
      return "Todas as linhas deste arquivo já haviam sido importadas.";
    }

    return "Não há linhas novas e prontas para importar.";
  }

  return null;
}

function applyConfirmedCategoryToTransactions(
  row: ImportPreviewRow,
  transactions: CommitImportTransactionDraft[],
  invoicePaymentMode: InvoicePaymentImportMode,
): CommitImportTransactionDraft[] {
  const categoryId = getConfirmedCategoryForCommit(row);
  if (!categoryId) {
    return transactions;
  }

  if (row.kind === "card_invoice_payment" && invoicePaymentMode === "payment") {
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
  billingConfig?: CreditCardBillingConfig | null,
  invoicePaymentModes: Record<number, InvoicePaymentImportMode> = {},
  invoicePaymentCycleTargets: Record<
    number,
    InvoicePaymentCycleTargetSelection
  > = {},
  cycleContext?: InvoicePaymentCycleResolveContext | null,
): CommitImportRowPayload {
  const invoiceSourceAccountId = invoiceSourceAccounts[row.sourceLine];
  const invoicePaymentMode = getInvoicePaymentImportMode(
    invoicePaymentModes,
    row.sourceLine,
  );
  const transactions = applyConfirmedCategoryToTransactions(
    row,
    mapImportRowToTransactions(
      row,
      targetAccountId,
      invoiceSourceAccountId,
      billingConfig,
      invoicePaymentMode,
      invoicePaymentCycleTargets,
      cycleContext,
    ),
    invoicePaymentMode,
  );

  return {
    sourceLine: row.sourceLine,
    identityKey,
    externalFingerprint: row.externalFingerprint,
    externalId: row.externalId,
    kind:
      row.kind === "card_invoice_payment" && invoicePaymentMode === "common"
        ? "card_purchase"
        : row.kind,
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
      statement_cycle_id: transaction.statementCycleId ?? null,
      statement_due_date: transaction.statementDueDate ?? null,
      invoice_payment_origin: transaction.invoicePaymentOrigin ?? null,
    })),
  };
}
