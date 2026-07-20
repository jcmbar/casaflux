import {
  getPlannedImportProviders,
  getSupportedImportProviders,
  IMPORT_INTEGRATIONS,
  type ImportLayoutKind,
  type ImportProviderId,
} from "./import-integrations";

export type ImportExportGuideStep = string;

export type ImportExportOnboardingLayout = {
  kind: ImportLayoutKind;
  layoutName: string;
  shortLabel: string;
  status: "supported" | "planned";
  /** Null when the layout is planned — never invent steps. */
  steps: ImportExportGuideStep[] | null;
};

export type ImportExportOnboardingCard = {
  providerId: ImportProviderId;
  name: string;
  status: "supported" | "planned";
  layouts: ImportExportOnboardingLayout[];
};

/**
 * Short, practical export paths keyed by catalog provider + layout.
 * Only supported layouts should have steps; missing entries stay planned.
 */
const EXPORT_STEPS: Partial<
  Record<ImportProviderId, Partial<Record<ImportLayoutKind, ImportExportGuideStep[]>>>
> = {
  nubank: {
    checking: [
      "Abra o app Nubank → Conta",
      "Abra o extrato e escolha o período",
      "Exporte ou compartilhe em CSV",
    ],
    credit_card: [
      "Abra o app Nubank → Cartão",
      "Abra a fatura ou o extrato do cartão",
      "Exporte em CSV",
    ],
  },
  inter: {
    checking: [
      "Abra o app Inter → Conta",
      "Abra o extrato e escolha o período",
      "Exporte o arquivo CSV",
    ],
  },
  bradesco: {
    checking: [
      "No computador, abra o Internet Banking Bradesco",
      "Vá em Saldos e Extratos → Extrato por período",
      "Salve como CSV (Data, Histórico, Crédito e Débito)",
    ],
  },
};

function stepsFor(
  providerId: ImportProviderId,
  kind: ImportLayoutKind,
  layoutStatus: "supported" | "planned",
): ImportExportGuideStep[] | null {
  if (layoutStatus !== "supported") {
    return null;
  }

  return EXPORT_STEPS[providerId]?.[kind] ?? null;
}

/**
 * Builds onboarding cards from the integrations catalog.
 * Supported banks get export steps; planned banks/layouts stay “em breve”.
 */
export function buildImportCsvOnboardingCards(): ImportExportOnboardingCard[] {
  return IMPORT_INTEGRATIONS.map((provider) => ({
    providerId: provider.id,
    name: provider.name,
    status: provider.status,
    layouts: provider.layouts.map((layout) => ({
      kind: layout.kind,
      layoutName: layout.layoutName,
      shortLabel: layout.shortLabel,
      status: layout.status,
      steps: stepsFor(provider.id, layout.kind, layout.status),
    })),
  }));
}

export function getSupportedImportCsvOnboardingCards(): ImportExportOnboardingCard[] {
  const supportedIds = new Set(
    getSupportedImportProviders().map((provider) => provider.id),
  );
  return buildImportCsvOnboardingCards().filter((card) =>
    supportedIds.has(card.providerId),
  );
}

export function getPlannedImportCsvOnboardingCards(): ImportExportOnboardingCard[] {
  const plannedIds = new Set(
    getPlannedImportProviders().map((provider) => provider.id),
  );
  return buildImportCsvOnboardingCards().filter((card) =>
    plannedIds.has(card.providerId),
  );
}
