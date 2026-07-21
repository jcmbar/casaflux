import { shouldAutoConfirmConfidence } from "./category-confidence";
import type { ImportPreviewRow } from "../types";

export type ImportCategoryReviewMode = "automatic" | "assisted" | "manual";

export type ImportCategoryReviewBucket =
  | "auto_resolved"
  | "needs_review"
  | "without_category"
  | "confirmed";

export type ImportCategoryReviewProgress = {
  total: number;
  resolved: number;
  pending: number;
  percent: number;
};

export type ImportCategoryReviewPartition = {
  autoResolved: ImportPreviewRow[];
  needsReview: ImportPreviewRow[];
  withoutCategory: ImportPreviewRow[];
  confirmed: ImportPreviewRow[];
  pending: ImportPreviewRow[];
};

export const IMPORT_CATEGORY_REVIEW_MODE_LABELS: Record<
  ImportCategoryReviewMode,
  string
> = {
  automatic: "Automático",
  assisted: "Assistido",
  manual: "Manual",
};

export const DEFAULT_IMPORT_CATEGORY_REVIEW_MODE: ImportCategoryReviewMode =
  "assisted";

export function isImportRowCategorizable(row: ImportPreviewRow): boolean {
  return (
    row.historicalStatus === "new" &&
    row.reviewStatus !== "invalid" &&
    row.reviewStatus !== "already_imported"
  );
}

export function isImportCategoryReviewPending(row: ImportPreviewRow): boolean {
  return isImportRowCategorizable(row) && row.categoryStatus !== "confirmed";
}

export function classifyImportCategoryReviewRow(
  row: ImportPreviewRow,
  mode: ImportCategoryReviewMode,
): ImportCategoryReviewBucket | null {
  if (!isImportRowCategorizable(row)) {
    return null;
  }

  if (row.categoryStatus === "confirmed") {
    if (
      mode === "automatic" &&
      row.categorySuggestion &&
      shouldAutoConfirmConfidence(row.categorySuggestion.confidence)
    ) {
      return "auto_resolved";
    }

    return "confirmed";
  }

  if (row.categoryStatus === "suggested") {
    return "needs_review";
  }

  return "without_category";
}

export function partitionImportCategoryReviewRows(
  rows: ImportPreviewRow[],
  mode: ImportCategoryReviewMode,
): ImportCategoryReviewPartition {
  const autoResolved: ImportPreviewRow[] = [];
  const needsReview: ImportPreviewRow[] = [];
  const withoutCategory: ImportPreviewRow[] = [];
  const confirmed: ImportPreviewRow[] = [];
  const pending: ImportPreviewRow[] = [];

  for (const row of rows) {
    const bucket = classifyImportCategoryReviewRow(row, mode);
    if (!bucket) {
      continue;
    }

    if (bucket === "auto_resolved") {
      autoResolved.push(row);
      continue;
    }

    if (bucket === "needs_review") {
      needsReview.push(row);
      pending.push(row);
      continue;
    }

    if (bucket === "without_category") {
      withoutCategory.push(row);
      pending.push(row);
      continue;
    }

    confirmed.push(row);
  }

  return {
    autoResolved,
    needsReview,
    withoutCategory,
    confirmed,
    pending,
  };
}

export function getImportCategoryReviewQueue(
  rows: ImportPreviewRow[],
  mode: ImportCategoryReviewMode,
): ImportPreviewRow[] {
  const partition = partitionImportCategoryReviewRows(rows, mode);

  if (mode === "automatic") {
    return [...partition.needsReview, ...partition.withoutCategory];
  }

  return partition.pending;
}

export function getImportCategoryReviewProgress(
  rows: ImportPreviewRow[],
): ImportCategoryReviewProgress {
  const categorizable = rows.filter(isImportRowCategorizable);
  const total = categorizable.length;
  const resolved = categorizable.filter(
    (row) => row.categoryStatus === "confirmed",
  ).length;
  const pending = total - resolved;
  const percent = total === 0 ? 100 : Math.round((resolved / total) * 100);

  return { total, resolved, pending, percent };
}

export function clampAssistedReviewIndex(
  index: number,
  queueLength: number,
): number {
  if (queueLength <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(index, queueLength - 1));
}

export function getNextAssistedReviewIndex(
  currentIndex: number,
  queueLength: number,
  action: "next" | "skip" | "confirm",
): number {
  if (queueLength <= 0) {
    return 0;
  }

  if (action === "confirm") {
    return clampAssistedReviewIndex(currentIndex, queueLength);
  }

  if (action === "next") {
    return clampAssistedReviewIndex(currentIndex + 1, queueLength);
  }

  return (currentIndex + 1) % queueLength;
}

export function getAssistedReviewRow(
  rows: ImportPreviewRow[],
  mode: ImportCategoryReviewMode,
  index: number,
): ImportPreviewRow | null {
  const queue = getImportCategoryReviewQueue(rows, mode);
  if (queue.length === 0) {
    return null;
  }

  return queue[clampAssistedReviewIndex(index, queue.length)] ?? null;
}
