export type ImportSource =
  | "nubank_checking"
  | "nubank_credit_card"
  | "inter_checking"
  | "bradesco_checking"
  | "c6_checking";

export type NormalizedImportKind =
  | "bank_income"
  | "bank_expense"
  | "bank_transfer_out"
  | "bank_reversal"
  | "card_purchase"
  | "card_fee"
  | "card_invoice_payment"
  | "unknown";

export type ImportDirection = "in" | "out";

export type ImportReviewStatus =
  | "ready"
  | "needs_account"
  | "possible_duplicate"
  | "already_imported"
  | "possible_historical_conflict"
  | "invalid";

export type ImportRowHistoricalStatus =
  | "new"
  | "already_imported"
  | "possible_historical_conflict";

export type ImportHistoricalMatch = {
  batchId: string;
  importedAt: string;
  identityKey: string;
  externalId: string | null;
};

export type NormalizedImportMetadata = {
  rawAmount?: string;
  installment?: string;
  nubankIdentifier?: string;
  linkedExternalId?: string;
  reversalPair?: boolean;
  cardAccountId?: string;
  /** Bank accounting date when distinct from launch date (e.g. C6). */
  accountingDate?: string;
  /** Short title / histórico when kept separate from description detail. */
  title?: string;
  /** End-of-day balance from the statement row, informational only. */
  balanceAfter?: number;
  rawEntrada?: string;
  rawSaida?: string;
};

export type NormalizedImportRow = {
  source: ImportSource;
  sourceLine: number;
  date: string;
  description: string;
  amount: number;
  direction: ImportDirection;
  kind: NormalizedImportKind;
  externalFingerprint: string;
  externalId: string | null;
  metadata: NormalizedImportMetadata;
  reviewStatus: ImportReviewStatus;
};

export type ImportCategorySuggestionConfidence = "high" | "medium" | "low";

export type ImportCategorySuggestionSource =
  | "exact_match"
  | "normalized_merchant"
  | "historical_frequency"
  | "category_keyword"
  | "propagated";

export type ImportCategorySuggestion = {
  categoryId: string;
  categoryName: string;
  confidence: ImportCategorySuggestionConfidence;
  source: ImportCategorySuggestionSource;
  basedOnCount: number;
  /** Present when source is category_keyword. */
  matchedKeyword?: string;
  /** When set (or source is propagated), UI shows Propagado from this line. */
  propagatedFromSourceLine?: number;
};

export type ImportCategoryStatus = "none" | "suggested" | "confirmed";

export type ImportCategorySummary = {
  suggestedCount: number;
  highConfidenceCount: number;
  confirmedCount: number;
  withoutCategoryCount: number;
};

export type ImportPreviewRow = NormalizedImportRow & {
  historicalStatus: ImportRowHistoricalStatus;
  historicalMatch?: ImportHistoricalMatch;
  normalizedDescription?: string;
  normalizedMerchant?: string;
  categorySuggestion?: ImportCategorySuggestion;
  categoryStatus: ImportCategoryStatus;
  confirmedCategoryId?: string | null;
};

export type ImportParseError = {
  sourceLine: number;
  message: string;
};

export type ImportParseResult = {
  rows: NormalizedImportRow[];
  errors: ImportParseError[];
};

export type ImportPreviewWarningCode =
  | "reversal_pair"
  | "parse_error"
  | "unknown_kind"
  | "unsupported_source"
  | "missing_account"
  | "file_already_imported"
  | "historical_duplicate_rows"
  | "historical_conflict_rows";

export type ImportPreviewWarning = {
  code: ImportPreviewWarningCode;
  message: string;
  sourceLine?: number;
  externalId?: string;
  relatedSourceLines?: number[];
  relatedBatchIds?: string[];
  importedAt?: string;
};

export type ImportPreviewDuplicateGroup = {
  key: string;
  sourceLines: number[];
};

export type ImportHistoricalSummary = {
  contentHash: string;
  fileAlreadyImported: boolean;
  matchingBatches: Array<{
    batchId: string;
    importedAt: string;
    fileName: string | null;
    rowCount: number;
  }>;
  newRowCount: number;
  alreadyImportedRowCount: number;
  conflictRowCount: number;
  partialOverlap: boolean;
};

export type ImportPreviewSummary = {
  source: ImportSource | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  countsByKind: Partial<Record<NormalizedImportKind, number>>;
  countsByReviewStatus: Partial<Record<ImportReviewStatus, number>>;
  countsByHistoricalStatus: Partial<Record<ImportRowHistoricalStatus, number>>;
  warningCount: number;
  duplicateGroupCount: number;
  fileAlreadyImported: boolean;
  historicalNewRowCount: number;
  historicalAlreadyImportedRowCount: number;
};

export type ImportPreview = {
  source: ImportSource | null;
  rows: ImportPreviewRow[];
  summary: ImportPreviewSummary;
  warnings: ImportPreviewWarning[];
  possibleDuplicates: ImportPreviewDuplicateGroup[];
  needsReview: ImportPreviewRow[];
  parseErrors: ImportParseError[];
  historicalSummary?: ImportHistoricalSummary;
  categorySummary?: ImportCategorySummary;
};
