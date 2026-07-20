import { buildNeedsReviewRows, getImportWarnings, summarizeImportPreview } from "../core/preview";
import type {
  ImportPreview,
  ImportPreviewRow,
  ImportPreviewWarning,
  ImportReviewStatus,
  NormalizedImportRow,
} from "../types";
import type { ImportHistoryContext, ImportHistoryRowMatch } from "./types";
import { buildImportRowIdentityKey } from "./row-identity";

function resolveReviewStatus(
  currentStatus: ImportReviewStatus,
  historicalStatus: ImportPreviewRow["historicalStatus"],
): ImportReviewStatus {
  if (currentStatus === "invalid") {
    return "invalid";
  }

  if (historicalStatus === "already_imported") {
    return "already_imported";
  }

  if (historicalStatus === "possible_historical_conflict") {
    return currentStatus === "possible_duplicate"
      ? "possible_duplicate"
      : "possible_historical_conflict";
  }

  return currentStatus;
}

function classifyHistoricalRow(
  row: NormalizedImportRow,
  accountId: string,
  history: ImportHistoryContext,
): Pick<ImportPreviewRow, "historicalStatus" | "historicalMatch" | "reviewStatus"> {
  const identityKey = buildImportRowIdentityKey(row, accountId);
  const exactMatch = history.rowsByIdentityKey.get(identityKey);

  if (exactMatch) {
    return {
      historicalStatus: "already_imported",
      historicalMatch: exactMatch,
      reviewStatus: resolveReviewStatus(row.reviewStatus, "already_imported"),
    };
  }

  if (row.externalId) {
    const externalMatches = history.rowsByExternalId.get(row.externalId) ?? [];
    if (externalMatches.length > 0) {
      return {
        historicalStatus: "possible_historical_conflict",
        historicalMatch: externalMatches[0],
        reviewStatus: resolveReviewStatus(
          row.reviewStatus,
          "possible_historical_conflict",
        ),
      };
    }
  }

  return {
    historicalStatus: "new",
    reviewStatus: row.reviewStatus,
  };
}

function buildHistoricalWarnings(
  preview: ImportPreview,
  history: ImportHistoryContext,
): ImportPreviewWarning[] {
  const warnings: ImportPreviewWarning[] = [];

  if (history.matchingBatches.length > 0) {
    const batch = history.matchingBatches[0];
    warnings.push({
      code: "file_already_imported",
      message:
        "Este arquivo parece já ter sido importado anteriormente para esta conta.",
      relatedBatchIds: history.matchingBatches.map((item) => item.batchId),
      importedAt: batch?.importedAt,
    });
  }

  const alreadyImportedCount = preview.rows.filter(
    (row) => row.historicalStatus === "already_imported",
  ).length;

  if (alreadyImportedCount > 0) {
    warnings.push({
      code: "historical_duplicate_rows",
      message: `${alreadyImportedCount} linha(s) já existem no histórico de importações desta conta.`,
    });
  }

  const conflictCount = preview.rows.filter(
    (row) => row.historicalStatus === "possible_historical_conflict",
  ).length;

  if (conflictCount > 0) {
    warnings.push({
      code: "historical_conflict_rows",
      message: `${conflictCount} linha(s) têm Identificador já visto com assinatura diferente.`,
    });
  }

  return warnings;
}

export function enrichImportPreviewWithHistory(
  preview: ImportPreview,
  history: ImportHistoryContext,
  accountId: string,
): ImportPreview {
  const enrichedRows: ImportPreviewRow[] = preview.rows.map((row) => {
    const historical = classifyHistoricalRow(row, accountId, history);
    return {
      ...row,
      ...historical,
    };
  });

  const historicalSummary = {
    contentHash: history.contentHash,
    fileAlreadyImported: history.matchingBatches.length > 0,
    matchingBatches: history.matchingBatches,
    newRowCount: enrichedRows.filter((row) => row.historicalStatus === "new").length,
    alreadyImportedRowCount: enrichedRows.filter(
      (row) => row.historicalStatus === "already_imported",
    ).length,
    conflictRowCount: enrichedRows.filter(
      (row) => row.historicalStatus === "possible_historical_conflict",
    ).length,
    partialOverlap:
      enrichedRows.some((row) => row.historicalStatus !== "new") &&
      enrichedRows.some((row) => row.historicalStatus === "new"),
  };

  const historicalWarnings = buildHistoricalWarnings(
    { ...preview, rows: enrichedRows },
    history,
  );

  const draft = {
    source: preview.source,
    rows: enrichedRows,
    warnings: [...preview.warnings, ...historicalWarnings],
    possibleDuplicates: preview.possibleDuplicates,
    needsReview: buildNeedsReviewRows(enrichedRows),
    parseErrors: preview.parseErrors,
    historicalSummary,
  };

  return {
    ...draft,
    summary: summarizeImportPreview(draft),
  };
}

export function createEmptyHistoryContext(contentHash: string): ImportHistoryContext {
  return {
    contentHash,
    matchingBatches: [],
    rowsByIdentityKey: new Map<string, ImportHistoryRowMatch>(),
    rowsByExternalId: new Map<string, ImportHistoryRowMatch[]>(),
  };
}

export function withDefaultHistoricalRows(rows: NormalizedImportRow[]): ImportPreviewRow[] {
  return rows.map((row) => ({
    ...row,
    historicalStatus: "new" as const,
    categoryStatus: "none" as const,
    confirmedCategoryId: null,
  }));
}
