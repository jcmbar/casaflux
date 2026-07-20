import type {
  ImportParseError,
  ImportPreview,
  ImportPreviewRow,
  ImportPreviewSummary,
  ImportPreviewWarning,
} from "../types";

type PreviewDraft = Pick<
  ImportPreview,
  | "source"
  | "rows"
  | "warnings"
  | "possibleDuplicates"
  | "needsReview"
  | "parseErrors"
  | "historicalSummary"
>;

export function getImportWarnings(
  rows: ImportPreviewRow[],
  parseErrors: ImportParseError[],
): ImportPreviewWarning[] {
  const warnings: ImportPreviewWarning[] = [];

  for (const error of parseErrors) {
    warnings.push({
      code: "parse_error",
      message: error.message,
      sourceLine: error.sourceLine,
    });
  }

  const reversalGroups = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.metadata.reversalPair || !row.externalId) {
      continue;
    }

    const sourceLines = reversalGroups.get(row.externalId) ?? [];
    sourceLines.push(row.sourceLine);
    reversalGroups.set(row.externalId, sourceLines);
  }

  for (const [externalId, sourceLines] of reversalGroups) {
    const relatedSourceLines = [...sourceLines].sort((a, b) => a - b);
    warnings.push({
      code: "reversal_pair",
      message: "Par de estorno detectado. Ambas as linhas foram preservadas.",
      externalId,
      relatedSourceLines,
    });
  }

  for (const row of rows) {
    if (row.kind !== "unknown") {
      continue;
    }

    warnings.push({
      code: "unknown_kind",
      message: `Classificação desconhecida: ${row.description}`,
      sourceLine: row.sourceLine,
    });
  }

  return warnings;
}

export function summarizeImportPreview(preview: PreviewDraft): ImportPreviewSummary {
  const countsByKind: ImportPreviewSummary["countsByKind"] = {};
  const countsByReviewStatus: ImportPreviewSummary["countsByReviewStatus"] = {};
  const countsByHistoricalStatus: ImportPreviewSummary["countsByHistoricalStatus"] = {};

  for (const row of preview.rows) {
    countsByKind[row.kind] = (countsByKind[row.kind] ?? 0) + 1;
    countsByReviewStatus[row.reviewStatus] =
      (countsByReviewStatus[row.reviewStatus] ?? 0) + 1;
    countsByHistoricalStatus[row.historicalStatus] =
      (countsByHistoricalStatus[row.historicalStatus] ?? 0) + 1;
  }

  const invalidRows = preview.rows.filter((row) => row.reviewStatus === "invalid").length;
  const validRows = preview.rows.length - invalidRows;

  return {
    source: preview.source,
    totalRows: preview.rows.length + preview.parseErrors.length,
    validRows,
    invalidRows: preview.parseErrors.length + invalidRows,
    countsByKind,
    countsByReviewStatus,
    countsByHistoricalStatus,
    warningCount: preview.warnings.length,
    duplicateGroupCount: preview.possibleDuplicates.length,
    fileAlreadyImported: preview.historicalSummary?.fileAlreadyImported ?? false,
    historicalNewRowCount: preview.historicalSummary?.newRowCount ?? preview.rows.length,
    historicalAlreadyImportedRowCount:
      preview.historicalSummary?.alreadyImportedRowCount ?? 0,
  };
}

export function buildNeedsReviewRows(rows: ImportPreviewRow[]): ImportPreviewRow[] {
  return rows.filter((row) => row.reviewStatus !== "ready");
}
