import type {
  ImportHistoryBatchRecord,
  ImportHistoryContext,
  ImportHistoryRowRecord,
  RegisterImportBatchInput,
} from "./types";

function buildHistoryContext(
  contentHash: string,
  batches: ImportHistoryBatchRecord[],
  rows: ImportHistoryRowRecord[],
): ImportHistoryContext {
  const rowsByIdentityKey = new Map<
    string,
    ImportHistoryContext["rowsByIdentityKey"] extends Map<string, infer Value>
      ? Value
      : never
  >();
  const rowsByExternalId = new Map<
    string,
    ImportHistoryContext["rowsByExternalId"] extends Map<string, infer Value>
      ? Value
      : never
  >();

  for (const row of rows) {
    const match = {
      batchId: row.batchId,
      importedAt: row.importedAt,
      identityKey: row.identityKey,
      externalId: row.externalId,
    };

    rowsByIdentityKey.set(row.identityKey, match);

    if (row.externalId) {
      const group = rowsByExternalId.get(row.externalId) ?? [];
      group.push(match);
      rowsByExternalId.set(row.externalId, group);
    }
  }

  return {
    contentHash,
    matchingBatches: batches.map((batch) => ({
      batchId: batch.id,
      importedAt: batch.importedAt,
      fileName: batch.fileName,
      rowCount: batch.rowCount,
    })),
    rowsByIdentityKey,
    rowsByExternalId,
  };
}

export class InMemoryImportHistoryStore {
  private batches: ImportHistoryBatchRecord[] = [];

  private rows: ImportHistoryRowRecord[] = [];

  reset() {
    this.batches = [];
    this.rows = [];
  }

  registerBatch(input: RegisterImportBatchInput): ImportHistoryBatchRecord {
    const importedAt = new Date().toISOString();
    const batch: ImportHistoryBatchRecord = {
      id: crypto.randomUUID(),
      ownerUserId: input.ownerUserId,
      familyId: input.familyId,
      accountId: input.accountId,
      source: input.source,
      fileName: input.fileName,
      contentHash: input.contentHash,
      rowCount: input.rows.length,
      status: "registered",
      importedAt,
    };

    this.batches.push(batch);

    for (const row of input.rows) {
      this.rows.push({
        id: crypto.randomUUID(),
        batchId: batch.id,
        ownerUserId: input.ownerUserId,
        accountId: input.accountId,
        source: input.source,
        sourceLine: row.sourceLine,
        identityKey: row.identityKey,
        externalFingerprint: row.externalFingerprint,
        externalId: row.externalId,
        kind: row.kind,
        rowDate: row.rowDate,
        amount: row.amount,
        direction: row.direction,
        description: row.description,
        importedAt,
      });
    }

    return batch;
  }

  fetchContext(params: {
    ownerUserId: string;
    accountId: string;
    contentHash: string;
    identityKeys: string[];
    externalIds: string[];
  }): ImportHistoryContext {
    const accountRows = this.rows.filter(
      (row) =>
        row.ownerUserId === params.ownerUserId &&
        row.accountId === params.accountId,
    );

    const matchingBatches = this.batches.filter(
      (batch) =>
        batch.ownerUserId === params.ownerUserId &&
        batch.accountId === params.accountId &&
        batch.contentHash === params.contentHash,
    );

    const identityKeySet = new Set(params.identityKeys);
    const externalIdSet = new Set(params.externalIds);

    const matchedRows = accountRows.filter(
      (row) =>
        identityKeySet.has(row.identityKey) ||
        (row.externalId ? externalIdSet.has(row.externalId) : false),
    );

    return buildHistoryContext(params.contentHash, matchingBatches, matchedRows);
  }
}

export function buildImportHistoryContext(
  contentHash: string,
  batches: ImportHistoryBatchRecord[],
  rows: ImportHistoryRowRecord[],
): ImportHistoryContext {
  return buildHistoryContext(contentHash, batches, rows);
}
