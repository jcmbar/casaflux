import { normalizeIsoDate, parseCsvContent } from "./normalize";
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

function buildSignals(
  source: ImportSource,
  content: string,
): ImportFileConfirmationSignal[] {
  const layout = getImportLayoutBySource(source);
  const rows = parseCsvContent(content);
  const dataRows = rows.length > 1 ? rows.slice(1) : [];
  const dateColumnIndex = 0;

  const dates: string[] = [];
  for (const row of dataRows) {
    const raw = row[dateColumnIndex]?.trim();
    if (!raw) continue;
    const iso = tryNormalizeDate(raw);
    if (iso) dates.push(iso);
  }

  dates.sort();

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

  if (dates.length > 0) {
    const from = dates[0];
    const to = dates[dates.length - 1];
    signals.push({
      label: "Período",
      value:
        from === to
          ? formatPeriodDate(from)
          : `${formatPeriodDate(from)} a ${formatPeriodDate(to)}`,
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
