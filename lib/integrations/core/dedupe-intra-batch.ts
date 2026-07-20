import type {
  ImportPreviewDuplicateGroup,
  ImportSource,
  NormalizedImportRow,
} from "../types";

export function buildCardIntraBatchDedupeKey(row: NormalizedImportRow): string {
  const normalizedTitle = row.description.trim().toLowerCase();
  const installment = row.metadata.installment ?? "";
  return `${row.date}:${row.amount}:${normalizedTitle}:${installment}`;
}

export function isKnownReversalPair(rows: NormalizedImportRow[]): boolean {
  if (rows.length !== 2) {
    return false;
  }

  const kinds = new Set(rows.map((row) => row.kind));
  return kinds.has("bank_reversal") && kinds.has("bank_transfer_out");
}

export type IntraBatchDedupeResult = {
  rows: NormalizedImportRow[];
  duplicateGroups: ImportPreviewDuplicateGroup[];
};

function markCardDuplicates(rows: NormalizedImportRow[]): IntraBatchDedupeResult {
  const groupsByKey = new Map<string, number[]>();
  const duplicateGroups: ImportPreviewDuplicateGroup[] = [];

  const nextRows = rows.map((row) => {
    const key = buildCardIntraBatchDedupeKey(row);
    const sourceLines = groupsByKey.get(key) ?? [];
    sourceLines.push(row.sourceLine);
    groupsByKey.set(key, sourceLines);

    if (sourceLines.length === 1) {
      return row;
    }

    if (sourceLines.length === 2) {
      duplicateGroups.push({ key, sourceLines: [...sourceLines] });
    } else {
      const existingGroup = duplicateGroups.find((group) => group.key === key);
      if (existingGroup) {
        existingGroup.sourceLines = [...sourceLines];
      }
    }

    return {
      ...row,
      reviewStatus: "possible_duplicate" as const,
    };
  });

  return { rows: nextRows, duplicateGroups };
}

function markCheckingDuplicates(rows: NormalizedImportRow[]): IntraBatchDedupeResult {
  const rowsByExternalId = new Map<string, NormalizedImportRow[]>();

  for (const row of rows) {
    if (!row.externalId) {
      continue;
    }

    const group = rowsByExternalId.get(row.externalId) ?? [];
    group.push(row);
    rowsByExternalId.set(row.externalId, group);
  }

  const duplicateExternalIds = new Set<string>();
  const duplicateGroups: ImportPreviewDuplicateGroup[] = [];

  for (const [externalId, group] of rowsByExternalId) {
    if (isKnownReversalPair(group)) {
      continue;
    }

    if (group.length >= 2) {
      duplicateExternalIds.add(externalId);
      duplicateGroups.push({
        key: `externalId:${externalId}`,
        sourceLines: group.map((row) => row.sourceLine).sort((a, b) => a - b),
      });
    }
  }

  const nextRows = rows.map((row) => {
    if (!row.externalId || !duplicateExternalIds.has(row.externalId)) {
      return row;
    }

    const group = rowsByExternalId.get(row.externalId)!;
    const firstSourceLine = Math.min(...group.map((item) => item.sourceLine));

    if (row.sourceLine === firstSourceLine) {
      return row;
    }

    return {
      ...row,
      reviewStatus: "possible_duplicate" as const,
    };
  });

  return { rows: nextRows, duplicateGroups };
}

export function applyIntraBatchDedupe(
  rows: NormalizedImportRow[],
  source: ImportSource,
): IntraBatchDedupeResult {
  if (source === "nubank_credit_card") {
    return markCardDuplicates(rows);
  }

  return markCheckingDuplicates(rows);
}
