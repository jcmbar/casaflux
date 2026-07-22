import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyTransactionsChanged } from "@/lib/finance/create-transaction";
import {
  getCreditCardBillingConfig,
  type CreditCardBillingConfig,
} from "@/lib/finance/credit-card-billing";
import { applyInvoicePaymentReconciliationsForBatch } from "@/lib/finance/reconcile-invoice-payment";
import { upsertCardStatementCycle } from "@/lib/finance/card-statement-cycles";
import { snapshotCategoryClassificationMemory } from "@/lib/integrations/categories/category-classification-memory";
import type { Account } from "@/types/account";
import { buildImportedCardStatementCycleUpserts } from "../invoice-payment/capture-imported-statement-cycle";
import { buildImportRowIdentityKey } from "../history/row-identity";
import type {
  InvoicePaymentCycleResolveContext,
  InvoicePaymentCycleTargetSelection,
} from "../invoice-payment/invoice-payment-cycle-target";
import { hydrateInvoicePaymentCycleTargetSelection } from "../invoice-payment/invoice-payment-cycle-target";
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
  buildImportSkippedRowsMessage,
  fetchExistingImportIdentityKeys,
  mergeCommitSkippedRows,
  partitionCommitPayloadByExistingIdentities,
  type CommitSkippedImportRow,
} from "./filter-commit-duplicates";
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
  /** Real closing/due of the imported CC statement file. */
  statementFileCycle?: {
    closingDate: string;
    dueDate: string;
  } | null;
  /** Persisted imported cycles for the card (due-date resolution). */
  importedStatementCycles?: InvoicePaymentCycleResolveContext["importedCycles"];
};

export type CommitImportPreviewResult =
  | {
      ok: true;
      batchId: string | null;
      committedRows: number;
      createdTransactions: number;
      reconciledInvoicePayments: number;
      skippedRows: CommitSkippedImportRow[];
    }
  | { ok: false; message: string };

function parseRpcSkippedRows(
  value: unknown,
): CommitSkippedImportRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const skippedRows: CommitSkippedImportRow[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const sourceLine = Number(
      (item as { source_line?: unknown }).source_line,
    );
    const identityKey = (item as { identity_key?: unknown }).identity_key;

    if (!Number.isFinite(sourceLine) || typeof identityKey !== "string") {
      continue;
    }

    skippedRows.push({ sourceLine, identityKey });
  }

  return skippedRows;
}

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
    statementFileCycle: input.statementFileCycle,
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
  const cycleContext: InvoicePaymentCycleResolveContext | null =
    input.statementFileCycle || input.importedStatementCycles?.length
      ? {
          fileCycle: input.statementFileCycle ?? null,
          importedCycles: input.importedStatementCycles,
        }
      : null;

  return committableRows.map((row) => {
    const rawSelection = cycleTargets[row.sourceLine];
    const hydratedTargets =
      billingConfig && rawSelection
        ? {
            ...cycleTargets,
            [row.sourceLine]: hydrateInvoicePaymentCycleTargetSelection(
              rawSelection,
              billingConfig,
              row.date,
              cycleContext,
            ),
          }
        : billingConfig && !rawSelection
          ? {
              ...cycleTargets,
              [row.sourceLine]: hydrateInvoicePaymentCycleTargetSelection(
                { target: "previous" },
                billingConfig,
                row.date,
                cycleContext,
              ),
            }
          : cycleTargets;

    return toRpcCommitRowPayload(
      buildCommitImportRowPayload(
        row,
        input.targetAccountId,
        buildImportRowIdentityKey(row, input.targetAccountId),
        input.invoiceSourceAccounts,
        billingConfig,
        modes,
        hydratedTargets,
        cycleContext,
      ),
    );
  });
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

  let prefetchedSkippedRows: CommitSkippedImportRow[] = [];
  let rowsToCommit = rowsPayload;

  try {
    const existingIdentityKeys = await fetchExistingImportIdentityKeys(supabase, {
      ownerUserId: input.ownerUserId,
      accountId: input.targetAccountId,
      identityKeys: rowsPayload.map((row) => row.identity_key),
    });
    const partitioned = partitionCommitPayloadByExistingIdentities(
      rowsPayload,
      existingIdentityKeys,
    );
    rowsToCommit = partitioned.committable;
    prefetchedSkippedRows = partitioned.skipped;
  } catch (error) {
    console.error(error);
  }

  if (rowsToCommit.length === 0) {
    const skippedRows = mergeCommitSkippedRows(prefetchedSkippedRows);
    return {
      ok: true,
      batchId: null,
      committedRows: 0,
      createdTransactions: 0,
      reconciledInvoicePayments: 0,
      skippedRows,
    };
  }

  const { data, error } = await supabase.rpc("commit_nubank_import", {
    p_family_id: input.familyId,
    p_account_id: input.targetAccountId,
    p_source: input.preview.source,
    p_file_name: input.fileName,
    p_content_hash: input.contentHash,
    p_rows: rowsToCommit,
  });

  if (error) {
    console.error(error);
    return {
      ok: false,
      message: error.message || "Não foi possível concluir a importação.",
    };
  }

  const result = data as {
    batch_id?: string | null;
    committed_rows?: number;
    created_transactions?: number;
    skipped_rows?: unknown;
  };

  const batchId = result.batch_id ?? "";
  const rpcSkippedRows = parseRpcSkippedRows(result.skipped_rows);
  const skippedRows = mergeCommitSkippedRows(prefetchedSkippedRows, rpcSkippedRows);
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

    const billingConfig = resolveImportBillingConfig(input.targetAccount);
    if (billingConfig) {
      const cycleUpserts = buildImportedCardStatementCycleUpserts({
        rows: input.preview.rows,
        billingConfig,
        accountId: input.targetAccountId,
        ownerUserId: input.ownerUserId,
        familyId: input.familyId,
        fileName: input.fileName,
        fileCycle: input.statementFileCycle,
        importBatchId: batchId,
        invoicePaymentModes: input.invoicePaymentModes,
        invoicePaymentCycleTargets: input.invoicePaymentCycleTargets,
      });

      for (const cycleUpsert of cycleUpserts) {
        const cycleResult = await upsertCardStatementCycle(supabase, cycleUpsert);
        if (!cycleResult.ok) {
          console.error(cycleResult.message);
        }
      }
    }

    // Persist category learning from newly committed txs so rolling back this
    // (or any) batch later does not erase suggestions on reimport.
    const learningAccountIds = [
      input.targetAccountId,
      ...Object.values(input.invoiceSourceAccounts ?? {}),
    ];
    const memoryResult = await snapshotCategoryClassificationMemory(
      supabase,
      learningAccountIds,
    );
    if (!memoryResult.ok) {
      console.error(memoryResult.message);
    }
  }

  notifyTransactionsChanged();

  return {
    ok: true,
    batchId: batchId || null,
    committedRows: result.committed_rows ?? 0,
    createdTransactions: result.created_transactions ?? 0,
    reconciledInvoicePayments,
    skippedRows,
  };
}
