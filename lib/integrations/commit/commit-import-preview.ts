import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyTransactionsChanged } from "@/lib/finance/create-transaction";
import {
  getCreditCardBillingConfig,
  type CreditCardBillingConfig,
} from "@/lib/finance/credit-card-billing";
import { applyInvoicePaymentReconciliationsForBatch } from "@/lib/finance/reconcile-invoice-payment";
import type { Account } from "@/types/account";
import { buildImportRowIdentityKey } from "../history/row-identity";
import type { InvoicePaymentCycleTargetSelection } from "../invoice-payment/invoice-payment-cycle-target";
import type { InvoicePaymentImportMode } from "../invoice-payment/resolve-invoice-payment";
import type {
  InvoicePaymentReconcileDecision,
  InvoicePaymentReconcileSuggestion,
} from "../invoice-payment/suggest-invoice-payment-reconcile";
import {
  getInvoicePaymentReconcileDecision,
} from "../invoice-payment/suggest-invoice-payment-reconcile";
import type { ImportPreview } from "../types";
import {
  buildCommitImportRowPayload,
  getCommitImportValidationError,
  getCommittableImportRows,
  toRpcCommitRowPayload,
} from "./map-import-row";

export type CommitImportPreviewInput = {
  preview: ImportPreview;
  targetAccountId: string;
  invoiceSourceAccounts: Record<number, string>;
  /** Confirm as payment (default) or import as common card income. */
  invoicePaymentModes?: Record<number, InvoicePaymentImportMode>;
  /** Statement cycle target per invoice payment row (default: previous). */
  invoicePaymentCycleTargets?: Record<
    number,
    InvoicePaymentCycleTargetSelection
  >;
  /**
   * Opt-in reconcile decisions per source line. Default is skip when unset.
   * Only `"link"` rows with a matching suggestion are applied after commit.
   */
  invoicePaymentReconcileDecisions?: Record<
    number,
    InvoicePaymentReconcileDecision
  >;
  invoicePaymentReconcileSuggestions?: Record<
    number,
    InvoicePaymentReconcileSuggestion
  >;
  ownerUserId: string;
  familyId: string | null;
  fileName: string | null;
  contentHash: string;
  /** Target credit-card account (used to resolve payment → cycle). */
  targetAccount?: Pick<
    Account,
    "type" | "statement_closing_day" | "statement_due_day"
  > | null;
};

export type CommitImportPreviewResult =
  | {
      ok: true;
      batchId: string;
      committedRows: number;
      createdTransactions: number;
      reconciledInvoicePayments: number;
    }
  | { ok: false; message: string };

function buildReconcileBatchItems(input: CommitImportPreviewInput) {
  const decisions = input.invoicePaymentReconcileDecisions ?? {};
  const suggestions = input.invoicePaymentReconcileSuggestions ?? {};
  const modes = input.invoicePaymentModes ?? {};
  const items: Array<{
    sourceLine: number;
    manualCardTransactionId: string;
    manualSourceTransactionId?: string | null;
  }> = [];

  for (const row of input.preview.rows) {
    if (row.kind !== "card_invoice_payment") {
      continue;
    }

    const mode = modes[row.sourceLine] ?? "payment";
    if (mode !== "payment") {
      continue;
    }

    if (getInvoicePaymentReconcileDecision(decisions, row.sourceLine) !== "link") {
      continue;
    }

    const suggestion = suggestions[row.sourceLine];
    if (!suggestion) {
      continue;
    }

    items.push({
      sourceLine: row.sourceLine,
      manualCardTransactionId: suggestion.manualCardTransactionId,
      manualSourceTransactionId: suggestion.manualSourceTransactionId,
    });
  }

  return items;
}

export function getCommitImportPreviewValidationError(
  input: CommitImportPreviewInput,
): string | null {
  return getCommitImportValidationError({
    previewRows: input.preview.rows,
    invoiceSourceAccounts: input.invoiceSourceAccounts,
    targetAccountId: input.targetAccountId,
    contentHash: input.contentHash,
    source: input.preview.source,
    invoicePaymentModes: input.invoicePaymentModes,
  });
}

export function resolveImportBillingConfig(
  targetAccount?: CommitImportPreviewInput["targetAccount"],
): CreditCardBillingConfig | null {
  if (!targetAccount) return null;
  return getCreditCardBillingConfig(targetAccount);
}

export function buildCommitImportRpcPayload(input: CommitImportPreviewInput) {
  const modes = input.invoicePaymentModes ?? {};
  const cycleTargets = input.invoicePaymentCycleTargets ?? {};
  const committableRows = getCommittableImportRows(
    input.preview.rows,
    input.invoiceSourceAccounts,
    modes,
  );
  const billingConfig = resolveImportBillingConfig(input.targetAccount);

  return committableRows.map((row) =>
    toRpcCommitRowPayload(
      buildCommitImportRowPayload(
        row,
        input.targetAccountId,
        buildImportRowIdentityKey(row, input.targetAccountId),
        input.invoiceSourceAccounts,
        billingConfig,
        modes,
        cycleTargets,
      ),
    ),
  );
}

export async function commitImportPreview(
  supabase: SupabaseClient,
  input: CommitImportPreviewInput,
): Promise<CommitImportPreviewResult> {
  const validationError = getCommitImportPreviewValidationError(input);
  if (validationError) {
    return { ok: false, message: validationError };
  }

  if (!input.preview.source) {
    return { ok: false, message: "Fonte de importação inválida." };
  }

  const rowsPayload = buildCommitImportRpcPayload(input);

  const { data, error } = await supabase.rpc("commit_nubank_import", {
    p_family_id: input.familyId,
    p_account_id: input.targetAccountId,
    p_source: input.preview.source,
    p_file_name: input.fileName,
    p_content_hash: input.contentHash,
    p_rows: rowsPayload,
  });

  if (error) {
    console.error(error);
    return {
      ok: false,
      message: error.message || "Não foi possível concluir a importação.",
    };
  }

  const result = data as {
    batch_id?: string;
    committed_rows?: number;
    created_transactions?: number;
  };

  const batchId = result.batch_id ?? "";
  let reconciledInvoicePayments = 0;

  if (batchId) {
    const reconcileItems = buildReconcileBatchItems(input);
    if (reconcileItems.length > 0) {
      const reconcileResult = await applyInvoicePaymentReconciliationsForBatch(
        supabase,
        { batchId, items: reconcileItems },
      );
      reconciledInvoicePayments = reconcileResult.linked;
      if (reconcileResult.error) {
        console.error(reconcileResult.error);
      }
    }
  }

  notifyTransactionsChanged();

  return {
    ok: true,
    batchId,
    committedRows: result.committed_rows ?? 0,
    createdTransactions: result.created_transactions ?? 0,
    reconciledInvoicePayments,
  };
}
