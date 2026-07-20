import type { ImportSource, NormalizedImportKind } from "../types";

export type ImportBatchStatus = "registered" | "committed" | "failed";

export type ImportHistoryBatchRecord = {
  id: string;
  ownerUserId: string;
  familyId: string | null;
  accountId: string;
  source: ImportSource;
  fileName: string | null;
  contentHash: string;
  rowCount: number;
  status: ImportBatchStatus;
  importedAt: string;
};

export type ImportHistoryRowRecord = {
  id: string;
  batchId: string;
  ownerUserId: string;
  accountId: string;
  source: ImportSource;
  sourceLine: number;
  identityKey: string;
  externalFingerprint: string;
  externalId: string | null;
  kind: NormalizedImportKind;
  rowDate: string;
  amount: number;
  direction: "in" | "out";
  description: string;
  importedAt: string;
};

export type ImportHistoryBatchMatch = {
  batchId: string;
  importedAt: string;
  fileName: string | null;
  rowCount: number;
};

export type ImportHistoryRowMatch = {
  batchId: string;
  importedAt: string;
  identityKey: string;
  externalId: string | null;
};

export type ImportHistoryContext = {
  contentHash: string;
  matchingBatches: ImportHistoryBatchMatch[];
  rowsByIdentityKey: Map<string, ImportHistoryRowMatch>;
  rowsByExternalId: Map<string, ImportHistoryRowMatch[]>;
};

export type RegisterImportBatchInput = {
  ownerUserId: string;
  familyId: string | null;
  accountId: string;
  fileName: string | null;
  contentHash: string;
  source: ImportSource;
  rows: Array<{
    sourceLine: number;
    identityKey: string;
    externalFingerprint: string;
    externalId: string | null;
    kind: NormalizedImportKind;
    rowDate: string;
    amount: number;
    direction: "in" | "out";
    description: string;
  }>;
};
