import {
  resolveImportSourceProvider,
} from "../providers/registry";
import type { ImportSourceProvider } from "../providers/types";
import {
  getImportLayoutBySource,
  getImportProviderBySource,
} from "../catalog/import-integrations";
import { applyIntraBatchDedupe } from "./dedupe-intra-batch";
import {
  buildNeedsReviewRows,
  getImportWarnings,
  summarizeImportPreview,
} from "./preview";
import { withDefaultHistoricalRows } from "../history/compare-preview-with-history";
import { UNSUPPORTED_IMPORT_FILE_MESSAGE } from "./identify-import-file";
import type { ImportPreview, ImportSource } from "../types";

export type BuildImportPreviewInput = {
  content: string;
  cardAccountId?: string;
};

function buildUnsupportedPreview(_content: string): ImportPreview {
  const warnings = [
    {
      code: "unsupported_source" as const,
      message: UNSUPPORTED_IMPORT_FILE_MESSAGE,
    },
  ];
  const parseErrors = [
    {
      sourceLine: 1,
      message: UNSUPPORTED_IMPORT_FILE_MESSAGE,
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

function buildMissingAccountPreview(source: ImportSource): ImportPreview {
  const layout = getImportLayoutBySource(source);
  const provider = getImportProviderBySource(source);
  const layoutPhrase =
    layout && provider
      ? `${layout.layoutName.toLowerCase()} do ${provider.name}`
      : "extrato de cartão";

  const warnings = [
    {
      code: "missing_account" as const,
      message: `Conta de cartão é obrigatória para importar ${layoutPhrase}.`,
    },
  ];
  const parseErrors = [
    {
      sourceLine: 1,
      message: "cardAccountId ausente para importação de cartão.",
    },
  ];

  const draft = {
    source,
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

function buildPreviewFromProvider(
  provider: ImportSourceProvider,
  input: BuildImportPreviewInput,
): ImportPreview {
  if (provider.requiresCardAccount && !input.cardAccountId) {
    return buildMissingAccountPreview(provider.source);
  }

  const parseResult = provider.parse({
    content: input.content,
    cardAccountId: input.cardAccountId,
  });

  const dedupeResult = applyIntraBatchDedupe(
    parseResult.rows,
    provider.source,
  );
  const rows = withDefaultHistoricalRows(dedupeResult.rows);
  const warnings = getImportWarnings(rows, parseResult.errors);
  const needsReview = buildNeedsReviewRows(rows);

  const draft = {
    source: provider.source,
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

/**
 * Builds an import preview via the registered source provider.
 * Identify → confirm (UI) → preview (here) → commit (shared) stay separate.
 */
export function buildImportPreview(input: BuildImportPreviewInput): ImportPreview {
  const provider = resolveImportSourceProvider(input.content);

  if (!provider) {
    return buildUnsupportedPreview(input.content);
  }

  return buildPreviewFromProvider(provider, input);
}
