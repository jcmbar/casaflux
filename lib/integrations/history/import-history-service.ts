import type { SupabaseClient } from "@supabase/supabase-js";

import type { ImportPreview } from "../types";
import { buildImportHistoryContext } from "./in-memory-store";
import { buildImportRowIdentityKey } from "./row-identity";
import type {
  ImportHistoryBatchRecord,
  ImportHistoryContext,
  ImportHistoryRowRecord,
  RegisterImportBatchInput,
} from "./types";

type ImportBatchRow = {
  id: string;
  batch_id: string;
  owner_user_id: string;
  account_id: string;
  source: ImportHistoryRowRecord["source"];
  source_line: number;
  identity_key: string;
  external_fingerprint: string;
  external_id: string | null;
  kind: ImportHistoryRowRecord["kind"];
  row_date: string;
  amount: number;
  direction: ImportHistoryRowRecord["direction"];
  description: string;
  created_at: string;
};

type ImportBatch = {
  id: string;
  owner_user_id: string;
  family_id: string | null;
  account_id: string;
  source: ImportHistoryBatchRecord["source"];
  file_name: string | null;
  content_hash: string;
  row_count: number;
  status: ImportHistoryBatchRecord["status"];
  imported_at: string;
};

function mapBatchRow(
  row: ImportBatchRow,
  importedAtByBatchId: Map<string, string>,
): ImportHistoryRowRecord {
  return {
    id: row.id,
    batchId: row.batch_id,
    ownerUserId: row.owner_user_id,
    accountId: row.account_id,
    source: row.source,
    sourceLine: row.source_line,
    identityKey: row.identity_key,
    externalFingerprint: row.external_fingerprint,
    externalId: row.external_id,
    kind: row.kind,
    rowDate: row.row_date,
    amount: Number(row.amount),
    direction: row.direction,
    description: row.description,
    importedAt: importedAtByBatchId.get(row.batch_id) ?? row.created_at,
  };
}

export async function fetchImportHistoryContext(
  supabase: SupabaseClient,
  params: {
    ownerUserId: string;
    accountId: string;
    contentHash: string;
    identityKeys: string[];
    externalIds: string[];
  },
): Promise<ImportHistoryContext> {
  const { data: batchData, error: batchError } = await supabase
    .from("import_batches")
    .select(
      "id, owner_user_id, family_id, account_id, source, file_name, content_hash, row_count, status, imported_at",
    )
    .eq("owner_user_id", params.ownerUserId)
    .eq("account_id", params.accountId)
    .eq("content_hash", params.contentHash)
    .order("imported_at", { ascending: false });

  if (batchError) {
    throw batchError;
  }

  const batches = (batchData ?? []) as ImportBatch[];
  const importedAtByBatchId = new Map(
    batches.map((batch) => [batch.id, batch.imported_at]),
  );

  const identityKeys = [...new Set(params.identityKeys)];
  const externalIds = [...new Set(params.externalIds.filter(Boolean))];

  const matchedRows = new Map<string, ImportHistoryRowRecord>();

  if (identityKeys.length > 0) {
    const { data, error } = await supabase
      .from("import_batch_rows")
      .select(
        "id, batch_id, owner_user_id, account_id, source, source_line, identity_key, external_fingerprint, external_id, kind, row_date, amount, direction, description, created_at",
      )
      .eq("owner_user_id", params.ownerUserId)
      .eq("account_id", params.accountId)
      .in("identity_key", identityKeys);

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as ImportBatchRow[]) {
      matchedRows.set(row.id, mapBatchRow(row, importedAtByBatchId));
    }
  }

  if (externalIds.length > 0) {
    const { data, error } = await supabase
      .from("import_batch_rows")
      .select(
        "id, batch_id, owner_user_id, account_id, source, source_line, identity_key, external_fingerprint, external_id, kind, row_date, amount, direction, description, created_at",
      )
      .eq("owner_user_id", params.ownerUserId)
      .eq("account_id", params.accountId)
      .in("external_id", externalIds);

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as ImportBatchRow[]) {
      matchedRows.set(row.id, mapBatchRow(row, importedAtByBatchId));
    }
  }

  const batchRecords: ImportHistoryBatchRecord[] = batches.map((batch) => ({
    id: batch.id,
    ownerUserId: batch.owner_user_id,
    familyId: batch.family_id,
    accountId: batch.account_id,
    source: batch.source,
    fileName: batch.file_name,
    contentHash: batch.content_hash,
    rowCount: batch.row_count,
    status: batch.status,
    importedAt: batch.imported_at,
  }));

  return buildImportHistoryContext(
    params.contentHash,
    batchRecords,
    [...matchedRows.values()],
  );
}

export async function registerImportBatchFromPreview(
  supabase: SupabaseClient,
  input: RegisterImportBatchInput,
): Promise<{ ok: true; batchId: string } | { ok: false; message: string }> {
  const { data: batchData, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      owner_user_id: input.ownerUserId,
      family_id: input.familyId,
      account_id: input.accountId,
      source: input.source,
      file_name: input.fileName,
      content_hash: input.contentHash,
      row_count: input.rows.length,
      status: "registered",
    })
    .select("id")
    .single();

  if (batchError || !batchData) {
    return {
      ok: false,
      message: batchError?.message ?? "Não foi possível registrar o batch de importação.",
    };
  }

  const batchId = batchData.id as string;

  if (input.rows.length === 0) {
    return { ok: true, batchId };
  }

  const { error: rowsError } = await supabase.from("import_batch_rows").insert(
    input.rows.map((row) => ({
      batch_id: batchId,
      owner_user_id: input.ownerUserId,
      account_id: input.accountId,
      source: input.source,
      source_line: row.sourceLine,
      identity_key: row.identityKey,
      external_fingerprint: row.externalFingerprint,
      external_id: row.externalId,
      kind: row.kind,
      row_date: row.rowDate,
      amount: row.amount,
      direction: row.direction,
      description: row.description,
    })),
  );

  if (rowsError) {
    await supabase.from("import_batches").delete().eq("id", batchId);
    return {
      ok: false,
      message: rowsError.message,
    };
  }

  return { ok: true, batchId };
}

export function buildRegisterInputFromPreview(params: {
  preview: ImportPreview;
  ownerUserId: string;
  familyId: string | null;
  accountId: string;
  fileName: string | null;
  contentHash: string;
}): RegisterImportBatchInput | null {
  if (!params.preview.source) {
    return null;
  }

  return {
    ownerUserId: params.ownerUserId,
    familyId: params.familyId,
    accountId: params.accountId,
    fileName: params.fileName,
    contentHash: params.contentHash,
    source: params.preview.source,
    rows: params.preview.rows.map((row) => ({
      sourceLine: row.sourceLine,
      identityKey: buildImportRowIdentityKey(row, params.accountId),
      externalFingerprint: row.externalFingerprint,
      externalId: row.externalId,
      kind: row.kind,
      rowDate: row.date,
      amount: row.amount,
      direction: row.direction,
      description: row.description,
    })),
  };
}
