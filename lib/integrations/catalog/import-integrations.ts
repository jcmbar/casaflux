import {
  INSTITUTIONS,
  type InstitutionId,
} from "@/lib/finance/institutions";
import type { ImportSource } from "../types";

/**
 * Single source of truth for CSV import providers and layouts.
 * Supported entries unlock identification → confirmation → preview/commit.
 * Planned entries exist for future UI only and must never unlock import.
 */

export type ImportProviderId = InstitutionId;

export type ImportLayoutKind = "checking" | "credit_card";

export type ImportIntegrationStatus = "supported" | "planned";

/** Shared product labels — keep list, onboarding and history aligned. */
export const IMPORT_AVAILABILITY_LABELS = {
  supported: "Disponível hoje",
  planned: "Em breve",
} as const;

export type ImportLayoutDefinition = {
  /** Stable catalog id (matches ImportSource when supported). */
  id: string;
  /** Runtime import source. Null while the layout is only planned. */
  source: ImportSource | null;
  providerId: ImportProviderId;
  kind: ImportLayoutKind;
  status: ImportIntegrationStatus;
  /** Full product label, e.g. "Nubank — Conta corrente". */
  label: string;
  /** Short layout word used in confirmation copy ("conta" / "cartão"). */
  shortLabel: string;
  /** Human layout name without bank, e.g. "Extrato de conta corrente". */
  layoutName: string;
};

export type ImportProviderDefinition = {
  id: ImportProviderId;
  institutionId: InstitutionId;
  name: string;
  status: ImportIntegrationStatus;
  layouts: ImportLayoutDefinition[];
};

function provider(
  institutionId: InstitutionId,
  status: ImportIntegrationStatus,
  layouts: Omit<ImportLayoutDefinition, "providerId">[],
): ImportProviderDefinition {
  const institution = INSTITUTIONS[institutionId];
  return {
    id: institutionId,
    institutionId,
    name: institution.name,
    status,
    layouts: layouts.map((layout) => ({
      ...layout,
      providerId: institutionId,
    })),
  };
}

/**
 * Catalog of import integrations. Add planned providers here before wiring parsers.
 */
export const IMPORT_INTEGRATIONS: readonly ImportProviderDefinition[] = [
  provider("nubank", "supported", [
    {
      id: "nubank_checking",
      source: "nubank_checking",
      kind: "checking",
      status: "supported",
      label: "Nubank — Conta corrente",
      shortLabel: "conta",
      layoutName: "Extrato de conta corrente",
    },
    {
      id: "nubank_credit_card",
      source: "nubank_credit_card",
      kind: "credit_card",
      status: "supported",
      label: "Nubank — Cartão de crédito",
      shortLabel: "cartão",
      layoutName: "Extrato de cartão de crédito",
    },
  ]),
  provider("inter", "supported", [
    {
      id: "inter_checking",
      source: "inter_checking",
      kind: "checking",
      status: "supported",
      label: "Inter — Conta corrente",
      shortLabel: "conta",
      layoutName: "Extrato de conta corrente",
    },
    // Credit card remains planned until a stable CSV layout is validated.
    {
      id: "inter_credit_card",
      source: null,
      kind: "credit_card",
      status: "planned",
      label: "Inter — Cartão de crédito",
      shortLabel: "cartão",
      layoutName: "Extrato de cartão de crédito",
    },
  ]),
  provider("bradesco", "supported", [
    {
      id: "bradesco_checking",
      source: "bradesco_checking",
      kind: "checking",
      status: "supported",
      label: "Bradesco — Conta corrente",
      shortLabel: "conta",
      layoutName: "Extrato de conta corrente",
    },
    {
      id: "bradesco_credit_card",
      source: null,
      kind: "credit_card",
      status: "planned",
      label: "Bradesco — Cartão de crédito",
      shortLabel: "cartão",
      layoutName: "Extrato de cartão de crédito",
    },
  ]),
  // Planned providers: registered for future UI, not importable yet.
  provider("itau", "planned", [
    {
      id: "itau_checking",
      source: null,
      kind: "checking",
      status: "planned",
      label: "Itaú — Conta corrente",
      shortLabel: "conta",
      layoutName: "Extrato de conta corrente",
    },
  ]),
];

export function getSupportedImportProviders(): ImportProviderDefinition[] {
  return IMPORT_INTEGRATIONS.filter(
    (entry) =>
      entry.status === "supported" &&
      entry.layouts.some((layout) => layout.status === "supported"),
  );
}

export function getPlannedImportProviders(): ImportProviderDefinition[] {
  return IMPORT_INTEGRATIONS.filter((entry) => entry.status === "planned");
}

export function getSupportedImportLayouts(): ImportLayoutDefinition[] {
  return getSupportedImportProviders().flatMap((providerEntry) =>
    providerEntry.layouts.filter((layout) => layout.status === "supported"),
  );
}

export function getSupportedImportSources(): ImportSource[] {
  return getSupportedImportLayouts()
    .map((layout) => layout.source)
    .filter((source): source is ImportSource => source != null);
}

export function isSupportedImportSource(
  source: string | null | undefined,
): source is ImportSource {
  if (!source) return false;
  return getSupportedImportSources().includes(source as ImportSource);
}

export function getImportLayoutBySource(
  source: ImportSource,
): ImportLayoutDefinition | null {
  for (const providerEntry of IMPORT_INTEGRATIONS) {
    for (const layout of providerEntry.layouts) {
      if (layout.source === source && layout.status === "supported") {
        return layout;
      }
    }
  }
  return null;
}

export function getImportProviderBySource(
  source: ImportSource,
): ImportProviderDefinition | null {
  const layout = getImportLayoutBySource(source);
  if (!layout) return null;
  return (
    IMPORT_INTEGRATIONS.find((entry) => entry.id === layout.providerId) ?? null
  );
}

/** Product labels keyed by runtime ImportSource (supported layouts only). */
export function buildImportSourceLabels(): Record<ImportSource, string> {
  const labels = {} as Record<ImportSource, string>;
  for (const layout of getSupportedImportLayouts()) {
    if (layout.source) {
      labels[layout.source] = layout.label;
    }
  }
  return labels;
}

export type SupportedImportBankSummary = {
  id: ImportProviderId;
  name: string;
  layouts: string[];
};

/** Compact bank+layout list for “suportados hoje” UI. */
export function getSupportedImportBankSummaries(): SupportedImportBankSummary[] {
  return getSupportedImportProviders().map((providerEntry) => ({
    id: providerEntry.id,
    name: providerEntry.name,
    layouts: providerEntry.layouts
      .filter((layout) => layout.status === "supported")
      .map((layout) => layout.layoutName),
  }));
}

export function formatSupportedImportBanksSummary(): string {
  const banks = getSupportedImportBankSummaries();
  if (banks.length === 0) {
    return "Nenhum banco disponível no momento.";
  }

  return banks
    .map((bank) => {
      const layouts = bank.layouts.map((name) => name.toLowerCase()).join(" ou ");
      return `${bank.name} — ${layouts}`;
    })
    .join("; ");
}

export function formatPlannedImportBanksSummary(): string | null {
  const planned = getPlannedImportProviders();
  if (planned.length === 0) return null;
  return planned.map((providerEntry) => providerEntry.name).join(", ");
}

export function formatSupportedImportBankNames(
  separator: string = ", ",
): string {
  return getSupportedImportBankSummaries()
    .map((bank) => bank.name)
    .join(separator);
}

export function getSupportedImportFileTip(): string {
  const banks = getSupportedImportBankSummaries();
  if (banks.length === 0) {
    return "Ainda não há bancos disponíveis para importação.";
  }
  if (banks.length === 1) {
    const bank = banks[0]!;
    const layouts = bank.layouts.map((name) => name.toLowerCase()).join(" ou ");
    return `Exporte o extrato em CSV pelo app do ${bank.name} — ${layouts}.`;
  }

  return `Exporte o extrato em CSV de um banco disponível hoje (${formatSupportedImportBankNames()}).`;
}

export function getUnsupportedImportFileMessage(): string {
  const banks = getSupportedImportBankSummaries();
  const supportedList =
    banks.length === 0
      ? "nenhum banco ainda"
      : banks.length === 1
        ? `CSV do ${banks[0]!.name}`
        : `CSV de ${formatSupportedImportBankNames()}`;

  return `Ainda não conseguimos importar este arquivo com segurança. Disponível hoje: ${supportedList}. Estamos ampliando a compatibilidade.`;
}

export function getImportReviewPageIntro(): string {
  return "Importe o CSV, revise o que será criado e confirme. Nada é gravado até você confirmar.";
}

export function getImportFileSelectHint(): string {
  const banks = getSupportedImportBankSummaries();
  if (banks.length === 1) {
    return `Selecione um CSV exportado pelo ${banks[0]!.name}`;
  }
  return "Selecione um CSV de um banco disponível hoje";
}

export function getImportationsListIntro(): string {
  return "Veja o que já entrou e comece uma nova importação quando quiser.";
}

export function getImportationsEmptyMessageFromCatalog(): string {
  const names = formatSupportedImportBankNames(" ou ");
  if (!names) {
    return "Você ainda não importou nenhum arquivo.";
  }
  return `Comece com um CSV de um banco disponível hoje (${names}). O guia abaixo mostra como exportar.`;
}

export function getImportNavDescription(): string {
  return "Histórico e novas importações de extratos.";
}

export function buildImportationTitleFromCatalog(source: ImportSource): string {
  const layout = getImportLayoutBySource(source);
  const providerEntry = getImportProviderBySource(source);
  if (!layout || !providerEntry) {
    return "Importação";
  }
  return `Importação do ${providerEntry.name} (${layout.shortLabel})`;
}

export function getImportSourceProductPhrase(source: ImportSource): string {
  const layout = getImportLayoutBySource(source);
  const providerEntry = getImportProviderBySource(source);
  if (!layout || !providerEntry) {
    return providerEntry?.name ?? "origem desconhecida";
  }
  return `${layout.shortLabel} ${providerEntry.name}`;
}
