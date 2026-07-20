import { detectImportSource } from "./detect-source";
import { applyIntraBatchDedupe } from "./dedupe-intra-batch";
import {
  buildNeedsReviewRows,
  getImportWarnings,
  summarizeImportPreview,
} from "./preview";
import { withDefaultHistoricalRows } from "../history/compare-preview-with-history";
import { parseNubankCheckingCsv } from "../sources/nubank/checking-parser";
import { parseNubankCreditCardCsv } from "../sources/nubank/credit-card-parser";
import type { ImportPreview } from "../types";

export type BuildImportPreviewInput = {
  content: string;
  cardAccountId?: string;
};

function buildUnsupportedPreview(content: string): ImportPreview {
  const warnings = [
    {
      code: "unsupported_source" as const,
      message: "Arquivo não reconhecido. Header CSV incompatível com Nubank.",
    },
  ];
  const parseErrors = [
    {
      sourceLine: 1,
      message: "Fonte de importação não reconhecida.",
    },
  ];

  const draft = {
    source: null,
    rows: [],
    warnings,
    possibleDuplicates: [],
    needsReview: [],
    parseErrors,
  };

  return {
    ...draft,
    summary: summarizeImportPreview(draft),
  };
}

function buildMissingAccountPreview(): ImportPreview {
  const warnings = [
    {
      code: "missing_account" as const,
      message: "Conta de cartão é obrigatória para importar extrato de cartão Nubank.",
    },
  ];
  const parseErrors = [
    {
      sourceLine: 1,
      message: "cardAccountId ausente para importação de cartão.",
    },
  ];

  const draft = {
    source: "nubank_credit_card" as const,
    rows: [],
    warnings,
    possibleDuplicates: [],
    needsReview: [],
    parseErrors,
  };

  return {
    ...draft,
    summary: summarizeImportPreview(draft),
  };
}

export function buildImportPreview(input: BuildImportPreviewInput): ImportPreview {
  const source = detectImportSource(input.content);

  if (!source) {
    return buildUnsupportedPreview(input.content);
  }

  if (source === "nubank_credit_card" && !input.cardAccountId) {
    return buildMissingAccountPreview();
  }

  const parseResult =
    source === "nubank_credit_card"
      ? parseNubankCreditCardCsv({
          content: input.content,
          cardAccountId: input.cardAccountId!,
        })
      : parseNubankCheckingCsv(input.content);

  const dedupeResult = applyIntraBatchDedupe(parseResult.rows, source);
  const rows = withDefaultHistoricalRows(dedupeResult.rows);
  const warnings = getImportWarnings(rows, parseResult.errors);
  const needsReview = buildNeedsReviewRows(rows);

  const draft = {
    source,
    rows,
    warnings,
    possibleDuplicates: dedupeResult.duplicateGroups,
    needsReview,
    parseErrors: parseResult.errors,
  };

  return {
    ...draft,
    summary: summarizeImportPreview(draft),
  };
}
