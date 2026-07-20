import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyTransactionsChanged } from "@/lib/finance/create-transaction";
import { buildImportRowIdentityKey } from "../history/row-identity";
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
  ownerUserId: string;
  familyId: string | null;
  fileName: string | null;
  contentHash: string;
};

export type CommitImportPreviewResult =
  | {
      ok: true;
      batchId: string;
      committedRows: number;
      createdTransactions: number;
    }
  | { ok: false; message: string };

export function getCommitImportPreviewValidationError(
  input: CommitImportPreviewInput,
): string | null {
  return getCommitImportValidationError({
    previewRows: input.preview.rows,
    invoiceSourceAccounts: input.invoiceSourceAccounts,
    targetAccountId: input.targetAccountId,
    contentHash: input.contentHash,
    source: input.preview.source,
  });
}

export function buildCommitImportRpcPayload(input: CommitImportPreviewInput) {
  const committableRows = getCommittableImportRows(
    input.preview.rows,
    input.invoiceSourceAccounts,
  );

  return committableRows.map((row) =>
    toRpcCommitRowPayload(
      buildCommitImportRowPayload(
        row,
        input.targetAccountId,
        buildImportRowIdentityKey(row, input.targetAccountId),
        input.invoiceSourceAccounts,
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

  notifyTransactionsChanged();

  return {
    ok: true,
    batchId: result.batch_id ?? "",
    committedRows: result.committed_rows ?? 0,
    createdTransactions: result.created_transactions ?? 0,
  };
}
