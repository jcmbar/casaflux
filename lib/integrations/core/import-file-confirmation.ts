import {
  detectCsvDelimiter,
  normalizeIsoDate,
  parseCsvContent,
} from "./normalize";
import {
  identifyImportFile,
  type IdentifiedImportFile,
} from "./identify-import-file";
import {
  getImportLayoutBySource,
  getImportProviderBySource,
  isSupportedImportSource,
} from "../catalog/import-integrations";
import { resolveImportSourceProvider } from "../providers/registry";
import type { ImportSource } from "../types";

export type ImportFileConfirmationSignal = {
  label: string;
  value: string;
};

export type ImportFileConfirmation = {
  source: ImportSource;
  institutionName: string;
  layoutShortLabel: string;
  headline: string;
  signals: ImportFileConfirmationSignal[];
};

export type ImportFileTransactionDateRange = {
  /** Inclusive min transaction date (`YYYY-MM-DD`). */
  from: string;
  /** Inclusive max transaction date (`YYYY-MM-DD`). */
  to: string;
};

const DATE_HEADER_NAMES = new Set(["date", "data"]);

function formatPeriodDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function tryNormalizeDate(raw: string): string | null {
  try {
    const iso = normalizeIsoDate(raw);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
  } catch {
    return null;
  }
}

function resolveDateColumnIndex(header: string[]): number {
  const normalized = header.map((column) => column.trim().toLowerCase());
  const byName = normalized.findIndex((column) => DATE_HEADER_NAMES.has(column));
  return byName >= 0 ? byName : 0;
}

/**
 * Real file date span from CSV line dates only (min/max).
 * Never derives statement-cycle bounds (closing/due / periodStart+1).
 */
export function getImportFileTransactionDateRange(
  content: string,
): ImportFileTransactionDateRange | null {
  const delimiter = detectCsvDelimiter(content);
  const rows = parseCsvContent(content, delimiter);
  if (rows.length <= 1) {
    return null;
  }

  const [header, ...dataRows] = rows;
  const dateColumnIndex = resolveDateColumnIndex(header ?? []);

  const dates: string[] = [];
  for (const row of dataRows) {
    const raw = row[dateColumnIndex]?.trim();
    if (!raw) continue;
    const iso = tryNormalizeDate(raw);
    if (iso) dates.push(iso);
  }

  if (dates.length === 0) {
    return null;
  }

  dates.sort();
  return {
    from: dates[0]!,
    to: dates[dates.length - 1]!,
  };
}

/** Preview PERÍODO label from the real file date range (not invoice cycle). */
export function formatImportFilePeriodLabel(
  range: ImportFileTransactionDateRange,
): string {
  if (range.from === range.to) {
    return formatPeriodDate(range.from);
  }

  return `${formatPeriodDate(range.from)} a ${formatPeriodDate(range.to)}`;
}

function buildSignals(
  source: ImportSource,
  content: string,
): ImportFileConfirmationSignal[] {
  const layout = getImportLayoutBySource(source);
  const delimiter = detectCsvDelimiter(content);
  const rows = parseCsvContent(content, delimiter);
  const dataRows = rows.length > 1 ? rows.slice(1) : [];
  const dateRange = getImportFileTransactionDateRange(content);

  const signals: ImportFileConfirmationSignal[] = [
    {
      label: "Layout",
      value: layout?.layoutName ?? "Extrato reconhecido",
    },
    {
      label: "Movimentações",
      value:
        dataRows.length === 1
          ? "1 linha encontrada"
          : `${dataRows.length} linhas encontradas`,
    },
  ];

  if (dateRange) {
    signals.push({
      label: "Período",
      value: formatImportFilePeriodLabel(dateRange),
    });
  }

  return signals;
}

export function buildImportFileConfirmation(
  content: string,
  identified?: Extract<IdentifiedImportFile, { status: "supported" }>,
): ImportFileConfirmation | null {
  const supported =
    identified ??
    (() => {
      const result = identifyImportFile(content);
      return result.status === "supported" ? result : null;
    })();

  if (!supported || !isSupportedImportSource(supported.source)) {
    return null;
  }

  // Keep provider resolution as the gate — never confirm without a runtime match.
  if (resolveImportSourceProvider(content)?.source !== supported.source) {
    return null;
  }

  const layout = getImportLayoutBySource(supported.source);
  const provider = getImportProviderBySource(supported.source);
  if (!layout || !provider) {
    return null;
  }

  return {
    source: supported.source,
    institutionName: provider.name,
    layoutShortLabel: layout.shortLabel,
    headline: `Encontramos um CSV do ${provider.name} — ${layout.shortLabel}`,
    signals: buildSignals(supported.source, content),
  };
}
