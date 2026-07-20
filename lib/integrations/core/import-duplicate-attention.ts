import { formatCurrency, formatDate } from "@/lib/format";

import type {
  ImportPreviewDuplicateGroup,
  ImportPreviewRow,
} from "../types";

export type ImportDuplicateReasonCode =
  | "same_content_in_file"
  | "same_bank_id_in_file"
  | "already_in_casaflux"
  | "bank_id_conflict";

export type ImportDuplicateLineDetail = {
  sourceLine: number;
  description: string;
  dateLabel: string;
  amountLabel: string;
  reasonCode: ImportDuplicateReasonCode;
  reason: string;
  /** Whether this specific line will be committed under current rules. */
  willImport: boolean;
};

export type ImportDuplicateAttentionGroup = {
  id: string;
  reasonCode: ImportDuplicateReasonCode;
  reason: string;
  sourceLines: number[];
  keptSourceLine: number | null;
};

export type ImportDuplicateAttention = {
  headline: string;
  /** Short line clarifying commit impact for these items. */
  outcomeSummary: string;
  groups: ImportDuplicateAttentionGroup[];
  lines: ImportDuplicateLineDetail[];
  intraFileCount: number;
  alreadyInCasafluxCount: number;
  conflictCount: number;
};

const REASON_LABELS: Record<ImportDuplicateReasonCode, string> = {
  same_content_in_file: "mesmo valor, data e descrição neste arquivo",
  same_bank_id_in_file: "mesmo identificador do banco neste arquivo",
  already_in_casaflux: "já existe no Casaflux (mesma assinatura)",
  bank_id_conflict:
    "mesmo identificador já visto no Casaflux, com dados diferentes",
};

export function resolveIntraFileDuplicateReasonCode(
  groupKey: string,
): Extract<
  ImportDuplicateReasonCode,
  "same_content_in_file" | "same_bank_id_in_file"
> {
  if (groupKey.startsWith("externalId:")) {
    return "same_bank_id_in_file";
  }

  return "same_content_in_file";
}

export function formatImportDuplicateReason(
  code: ImportDuplicateReasonCode,
): string {
  return REASON_LABELS[code];
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatImportDuplicateHeadline(input: {
  intraFileCount: number;
  alreadyInCasafluxCount: number;
  conflictCount: number;
}): string {
  const parts: string[] = [];

  if (input.alreadyInCasafluxCount > 0) {
    parts.push(
      pluralize(
        input.alreadyInCasafluxCount,
        "lançamento parece já existir no Casaflux",
        "lançamentos parecem já existir no Casaflux",
      ),
    );
  }

  if (input.intraFileCount > 0) {
    parts.push(
      pluralize(
        input.intraFileCount,
        "linha repetida neste arquivo",
        "linhas repetidas neste arquivo",
      ),
    );
  }

  if (input.conflictCount > 0) {
    parts.push(
      pluralize(
        input.conflictCount,
        "linha com identificador já visto",
        "linhas com identificador já visto",
      ),
    );
  }

  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0]!;
  }

  return `${parts[0]}, ${parts.slice(1).join(", ")}`;
}

export function formatImportDuplicateOutcomeSummary(input: {
  willImportCount: number;
  willSkipCount: number;
}): string {
  if (input.willSkipCount <= 0 && input.willImportCount <= 0) {
    return "";
  }

  if (input.willImportCount > 0 && input.willSkipCount > 0) {
    return `${pluralize(
      input.willImportCount,
      "lançamento deste grupo será gravado",
      "lançamentos deste grupo serão gravados",
    )}; ${pluralize(
      input.willSkipCount,
      "ficará de fora",
      "ficarão de fora",
    )}.`;
  }

  if (input.willImportCount > 0) {
    return `${pluralize(
      input.willImportCount,
      "lançamento deste grupo será gravado",
      "lançamentos deste grupo serão gravados",
    )}.`;
  }

  return "Nenhum desses será gravado nesta importação.";
}

function buildRowLookup(
  rows: ImportPreviewRow[],
): Map<number, ImportPreviewRow> {
  return new Map(rows.map((row) => [row.sourceLine, row]));
}

function toLineDetail(
  row: ImportPreviewRow,
  reasonCode: ImportDuplicateReasonCode,
  willImport: boolean,
): ImportDuplicateLineDetail {
  return {
    sourceLine: row.sourceLine,
    description: row.description,
    dateLabel: formatDate(row.date),
    amountLabel: formatCurrency(row.amount),
    reasonCode,
    reason: formatImportDuplicateReason(reasonCode),
    willImport,
  };
}

/**
 * Presentation helper for duplicate transparency before commit.
 * Does not change commit/dedupe rules — only explains current markings.
 */
export function buildImportDuplicateAttention(input: {
  rows: ImportPreviewRow[];
  possibleDuplicates: ImportPreviewDuplicateGroup[];
  /** Source lines that remain committable under current invoice/account state. */
  committableSourceLines: ReadonlySet<number>;
}): ImportDuplicateAttention | null {
  const rowsByLine = buildRowLookup(input.rows);
  const coveredLines = new Set<number>();
  const groups: ImportDuplicateAttentionGroup[] = [];
  const lines: ImportDuplicateLineDetail[] = [];

  let intraFileCount = 0;
  let alreadyInCasafluxCount = 0;
  let conflictCount = 0;
  let willImportCount = 0;
  let willSkipCount = 0;

  for (const group of input.possibleDuplicates) {
    const reasonCode = resolveIntraFileDuplicateReasonCode(group.key);
    const sortedLines = [...group.sourceLines].sort((a, b) => a - b);
    const keptSourceLine = sortedLines[0] ?? null;

    groups.push({
      id: `intra:${group.key}`,
      reasonCode,
      reason: formatImportDuplicateReason(reasonCode),
      sourceLines: sortedLines,
      keptSourceLine,
    });

    for (const sourceLine of sortedLines) {
      const row = rowsByLine.get(sourceLine);
      if (!row) {
        continue;
      }

      coveredLines.add(sourceLine);
      const isExtra =
        row.reviewStatus === "possible_duplicate" ||
        (keptSourceLine !== null && sourceLine !== keptSourceLine);
      if (isExtra) {
        intraFileCount += 1;
      }

      const willImport = input.committableSourceLines.has(sourceLine);
      if (willImport) {
        willImportCount += 1;
      } else {
        willSkipCount += 1;
      }

      lines.push(toLineDetail(row, reasonCode, willImport));
    }
  }

  const historicalAlreadyImportedLines: number[] = [];
  const historicalConflictLines: number[] = [];

  for (const row of input.rows) {
    if (coveredLines.has(row.sourceLine)) {
      continue;
    }

    const isAlreadyImported =
      row.historicalStatus === "already_imported" ||
      row.reviewStatus === "already_imported";
    const isConflict =
      row.historicalStatus === "possible_historical_conflict" ||
      row.reviewStatus === "possible_historical_conflict";

    if (!isAlreadyImported && !isConflict) {
      continue;
    }

    const reasonCode: ImportDuplicateReasonCode = isAlreadyImported
      ? "already_in_casaflux"
      : "bank_id_conflict";

    if (isAlreadyImported) {
      alreadyInCasafluxCount += 1;
      historicalAlreadyImportedLines.push(row.sourceLine);
    } else {
      conflictCount += 1;
      historicalConflictLines.push(row.sourceLine);
    }

    const willImport = input.committableSourceLines.has(row.sourceLine);
    if (willImport) {
      willImportCount += 1;
    } else {
      willSkipCount += 1;
    }

    lines.push(toLineDetail(row, reasonCode, willImport));
  }

  if (historicalAlreadyImportedLines.length > 0) {
    groups.push({
      id: "hist:already_imported",
      reasonCode: "already_in_casaflux",
      reason: formatImportDuplicateReason("already_in_casaflux"),
      sourceLines: historicalAlreadyImportedLines.sort((a, b) => a - b),
      keptSourceLine: null,
    });
  }

  if (historicalConflictLines.length > 0) {
    groups.push({
      id: "hist:conflict",
      reasonCode: "bank_id_conflict",
      reason: formatImportDuplicateReason("bank_id_conflict"),
      sourceLines: historicalConflictLines.sort((a, b) => a - b),
      keptSourceLine: null,
    });
  }

  lines.sort((a, b) => a.sourceLine - b.sourceLine);

  if (lines.length === 0) {
    return null;
  }

  return {
    headline: formatImportDuplicateHeadline({
      intraFileCount,
      alreadyInCasafluxCount,
      conflictCount,
    }),
    outcomeSummary: formatImportDuplicateOutcomeSummary({
      willImportCount,
      willSkipCount,
    }),
    groups,
    lines,
    intraFileCount,
    alreadyInCasafluxCount,
    conflictCount,
  };
}

/** Short reason for a single preview row, when it is a duplicate-like skip. */
export function getImportRowDuplicateReason(
  row: ImportPreviewRow,
  possibleDuplicates: ImportPreviewDuplicateGroup[],
): string | null {
  if (row.reviewStatus === "possible_duplicate") {
    const group = possibleDuplicates.find((item) =>
      item.sourceLines.includes(row.sourceLine),
    );
    const code = group
      ? resolveIntraFileDuplicateReasonCode(group.key)
      : "same_content_in_file";
    return formatImportDuplicateReason(code);
  }

  if (
    row.historicalStatus === "already_imported" ||
    row.reviewStatus === "already_imported"
  ) {
    return formatImportDuplicateReason("already_in_casaflux");
  }

  if (
    row.historicalStatus === "possible_historical_conflict" ||
    row.reviewStatus === "possible_historical_conflict"
  ) {
    return formatImportDuplicateReason("bank_id_conflict");
  }

  return null;
}
