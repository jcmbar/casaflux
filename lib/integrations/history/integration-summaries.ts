import {
  getImportProviderBySource,
  getSupportedImportProviders,
  type ImportProviderId,
} from "../catalog/import-integrations";
import type { ImportSource } from "../types";
import type { ImportBatchStatus } from "./types";

export type ImportIntegrationHistoryItem = {
  source: ImportSource;
  status: ImportBatchStatus;
  createdLaunchCount: number;
  ignoredItemCount: number;
  rowCount: number;
};

export type ImportIntegrationHistorySummary = {
  providerId: ImportProviderId;
  name: string;
  /** Product title, e.g. "Importações Nubank". */
  title: string;
  /** Committed imports only. */
  successfulImports: number;
  /** All history rows for this bank (any status). */
  totalImports: number;
  createdLaunches: number;
  ignoredItems: number;
  fileRows: number;
  /** Short metric line for the UI. */
  metricsLabel: string;
};

function sourcesForProvider(providerId: ImportProviderId): Set<ImportSource> {
  const provider = getSupportedImportProviders().find(
    (entry) => entry.id === providerId,
  );
  if (!provider) return new Set();

  return new Set(
    provider.layouts
      .filter((layout) => layout.status === "supported" && layout.source)
      .map((layout) => layout.source as ImportSource),
  );
}

export function formatImportIntegrationMetricsLabel(input: {
  successfulImports: number;
  createdLaunches: number;
  ignoredItems: number;
}): string {
  if (input.successfulImports === 0) {
    return "Nenhuma importação concluída ainda";
  }

  const files =
    input.successfulImports === 1
      ? "1 arquivo"
      : `${input.successfulImports} arquivos`;

  const created =
    input.createdLaunches === 1
      ? "1 lançamento criado"
      : `${input.createdLaunches} lançamentos criados`;

  if (input.ignoredItems <= 0) {
    return `${files} · ${created}`;
  }

  const ignored =
    input.ignoredItems === 1
      ? "1 linha ignorada"
      : `${input.ignoredItems} linhas ignoradas`;

  return `${files} · ${created} · ${ignored}`;
}

/**
 * Builds one summary card per catalog-supported bank.
 * Planned providers (no supported layouts) are omitted.
 * Banks with zero history still appear with empty metrics.
 */
export function buildImportIntegrationHistorySummaries(
  items: ImportIntegrationHistoryItem[],
): ImportIntegrationHistorySummary[] {
  return getSupportedImportProviders().map((provider) => {
    const sources = sourcesForProvider(provider.id);
    const providerItems = items.filter((item) => sources.has(item.source));
    const successful = providerItems.filter(
      (item) => item.status === "committed",
    );

    const createdLaunches = successful.reduce(
      (sum, item) => sum + item.createdLaunchCount,
      0,
    );
    const ignoredItems = successful.reduce(
      (sum, item) => sum + item.ignoredItemCount,
      0,
    );
    const fileRows = successful.reduce((sum, item) => sum + item.rowCount, 0);

    return {
      providerId: provider.id,
      name: provider.name,
      title: `Importações ${provider.name}`,
      successfulImports: successful.length,
      totalImports: providerItems.length,
      createdLaunches,
      ignoredItems,
      fileRows,
      metricsLabel: formatImportIntegrationMetricsLabel({
        successfulImports: successful.length,
        createdLaunches,
        ignoredItems,
      }),
    };
  });
}

export function hasImportIntegrationHistoryActivity(
  summaries: ImportIntegrationHistorySummary[],
): boolean {
  return summaries.some((summary) => summary.totalImports > 0);
}

/** Resolves provider id for a history source (supported sources only). */
export function getHistoryProviderIdForSource(
  source: ImportSource,
): ImportProviderId | null {
  return getImportProviderBySource(source)?.id ?? null;
}
