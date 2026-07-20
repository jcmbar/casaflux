import { importKindLabels } from "../ui/labels";
import type { InvoicePaymentImportMode } from "../invoice-payment/resolve-invoice-payment";
import {
  isImportRowCommittable,
} from "../commit/map-import-row";
import type {
  ImportPreviewRow,
  NormalizedImportKind,
} from "../types";

export type ImportReviewDiagnosisKindCount = {
  kind: NormalizedImportKind;
  label: string;
  count: number;
};

export type ImportReviewDiagnosisAttention = {
  id: string;
  label: string;
  count: number;
};

export type ImportReviewDiagnosis = {
  /** Short scannable line for the top of review. */
  headline: string;
  readyCount: number;
  skippedCount: number;
  attentionCount: number;
  kindBreakdown: ImportReviewDiagnosisKindCount[];
  attentionItems: ImportReviewDiagnosisAttention[];
};

function pluralize(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatImportReviewHeadline(input: {
  readyCount: number;
  skippedCount: number;
}): string {
  const ready = pluralize(
    input.readyCount,
    "lançamento pronto para importar",
    "lançamentos prontos para importar",
  );

  if (input.skippedCount <= 0) {
    return ready;
  }

  return `${ready}, ${pluralize(
    input.skippedCount,
    "linha ignorada",
    "linhas ignoradas",
  )}`;
}

/**
 * Presentation diagnosis for the import review step.
 * Uses the same committable rules as commit — does not change providers/commit.
 */
export function buildImportReviewDiagnosis(input: {
  rows: ImportPreviewRow[];
  invoiceSourceAccounts?: Record<number, string>;
  invoicePaymentModes?: Record<number, InvoicePaymentImportMode>;
}): ImportReviewDiagnosis {
  const invoiceSourceAccounts = input.invoiceSourceAccounts ?? {};
  const invoicePaymentModes = input.invoicePaymentModes ?? {};

  let readyCount = 0;
  let skippedCount = 0;
  let alreadyImported = 0;
  let duplicates = 0;
  let needsAccount = 0;
  let conflicts = 0;
  let invalid = 0;
  let unknown = 0;

  const kindCounts: Partial<Record<NormalizedImportKind, number>> = {};

  for (const row of input.rows) {
    kindCounts[row.kind] = (kindCounts[row.kind] ?? 0) + 1;

    if (
      isImportRowCommittable(row, invoiceSourceAccounts, invoicePaymentModes)
    ) {
      readyCount += 1;
      continue;
    }

    skippedCount += 1;

    if (
      row.historicalStatus === "already_imported" ||
      row.reviewStatus === "already_imported"
    ) {
      alreadyImported += 1;
    } else if (row.reviewStatus === "possible_duplicate") {
      duplicates += 1;
    } else if (row.reviewStatus === "needs_account") {
      needsAccount += 1;
    } else if (
      row.historicalStatus === "possible_historical_conflict" ||
      row.reviewStatus === "possible_historical_conflict"
    ) {
      conflicts += 1;
    } else if (row.reviewStatus === "invalid" || row.kind === "unknown") {
      if (row.kind === "unknown") unknown += 1;
      else invalid += 1;
    }
  }

  const attentionItems: ImportReviewDiagnosisAttention[] = [];
  if (needsAccount > 0) {
    attentionItems.push({
      id: "needs_account",
      label:
        needsAccount === 1
          ? "1 linha precisa de conta de origem"
          : `${needsAccount} linhas precisam de conta de origem`,
      count: needsAccount,
    });
  }
  if (duplicates > 0) {
    attentionItems.push({
      id: "duplicates",
      label:
        duplicates === 1
          ? "1 linha repetida neste arquivo (não será gravada)"
          : `${duplicates} linhas repetidas neste arquivo (não serão gravadas)`,
      count: duplicates,
    });
  }
  if (conflicts > 0) {
    attentionItems.push({
      id: "conflicts",
      label:
        conflicts === 1
          ? "1 linha com identificador já visto no Casaflux"
          : `${conflicts} linhas com identificador já visto no Casaflux`,
      count: conflicts,
    });
  }
  if (alreadyImported > 0) {
    attentionItems.push({
      id: "already_imported",
      label:
        alreadyImported === 1
          ? "1 lançamento parece já existir no Casaflux"
          : `${alreadyImported} lançamentos parecem já existir no Casaflux`,
      count: alreadyImported,
    });
  }
  if (unknown > 0) {
    attentionItems.push({
      id: "unknown",
      label:
        unknown === 1
          ? "1 linha sem classificação clara"
          : `${unknown} linhas sem classificação clara`,
      count: unknown,
    });
  }
  if (invalid > 0) {
    attentionItems.push({
      id: "invalid",
      label:
        invalid === 1
          ? "1 linha inválida"
          : `${invalid} linhas inválidas`,
      count: invalid,
    });
  }

  const kindBreakdown = (
    Object.entries(kindCounts) as Array<[NormalizedImportKind, number]>
  )
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => ({
      kind,
      label:
        kind === "card_invoice_payment"
          ? "Pagamento de fatura"
          : importKindLabels[kind],
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));

  return {
    headline: formatImportReviewHeadline({ readyCount, skippedCount }),
    readyCount,
    skippedCount,
    attentionCount: attentionItems.reduce((sum, item) => sum + item.count, 0),
    kindBreakdown,
    attentionItems,
  };
}
