import type { ImportPreviewRow } from "../types";

export const IMPORT_CATEGORY_FEEDBACK_MS = 2800;

export type ImportCategoryFeedbackKind = "created" | "updated";

export type ImportCategoryFeedback = {
  kind: ImportCategoryFeedbackKind;
  categoryId: string;
  until: number;
};

export function getImportCategoryFeedbackLabel(
  kind: ImportCategoryFeedbackKind,
): string {
  return kind === "created" ? "Nova" : "Atualizada";
}

export function buildImportCategoryFeedback(
  kind: ImportCategoryFeedbackKind,
  categoryId: string,
  now = Date.now(),
): ImportCategoryFeedback {
  return {
    kind,
    categoryId,
    until: now + IMPORT_CATEGORY_FEEDBACK_MS,
  };
}

export function isImportCategoryFeedbackActive(
  feedback: ImportCategoryFeedback | null | undefined,
  categoryId: string,
  now = Date.now(),
): boolean {
  if (!feedback) {
    return false;
  }

  return feedback.categoryId === categoryId && feedback.until > now;
}

export function getSourceLinesAffectedByCategory(
  rows: ImportPreviewRow[],
  categoryId: string,
): number[] {
  return rows
    .filter(
      (row) =>
        row.confirmedCategoryId === categoryId ||
        row.categorySuggestion?.categoryId === categoryId,
    )
    .map((row) => row.sourceLine);
}

export function buildImportCategoryFeedbackForSave(input: {
  rows: ImportPreviewRow[];
  categoryId: string;
  sourceLine: number;
  mode: ImportCategoryFeedbackKind | "create" | "update";
  now?: number;
}): Record<number, ImportCategoryFeedback> {
  const now = input.now ?? Date.now();

  if (input.mode === "create") {
    return {
      [input.sourceLine]: buildImportCategoryFeedback(
        "created",
        input.categoryId,
        now,
      ),
    };
  }

  const affectedLines = getSourceLinesAffectedByCategory(
    input.rows,
    input.categoryId,
  );

  return Object.fromEntries(
    affectedLines.map((sourceLine) => [
      sourceLine,
      buildImportCategoryFeedback("updated", input.categoryId, now),
    ]),
  );
}

export function pruneExpiredImportCategoryFeedback(
  feedbackByLine: Record<number, ImportCategoryFeedback>,
  now = Date.now(),
): Record<number, ImportCategoryFeedback> {
  const next: Record<number, ImportCategoryFeedback> = {};

  for (const [line, feedback] of Object.entries(feedbackByLine)) {
    if (feedback.until > now) {
      next[Number(line)] = feedback;
    }
  }

  return next;
}
