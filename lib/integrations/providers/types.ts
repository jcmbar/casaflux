import type { ImportProviderId } from "../catalog/import-integrations";
import type { ImportParseResult, ImportSource } from "../types";

/**
 * Context for parsing a CSV once the layout has been identified.
 * Commit stays outside providers — they only normalize rows for preview.
 */
export type ImportProviderParseInput = {
  content: string;
  /** Required when `requiresCardAccount` is true. */
  cardAccountId?: string;
};

/**
 * Contract for a single importable layout (e.g. Nubank checking CSV).
 * Catalog remains the source of status/copy; providers implement detection + parse.
 */
export type ImportSourceProvider = {
  /** Runtime source id — must match a catalog-supported layout.source. */
  source: ImportSource;
  /** Catalog provider id (bank/institution). */
  providerId: ImportProviderId;
  /** Credit-card layouts need a destination card before preview fingerprints. */
  requiresCardAccount: boolean;
  /** Header/content heuristic — true when this layout owns the file. */
  matches: (content: string) => boolean;
  /** Parse into normalized import rows (no DB writes). */
  parse: (input: ImportProviderParseInput) => ImportParseResult;
};

/**
 * Optional bank-level grouping of layout providers (for registration clarity).
 */
export type ImportIntegrationProvider = {
  id: ImportProviderId;
  layouts: readonly ImportSourceProvider[];
};
