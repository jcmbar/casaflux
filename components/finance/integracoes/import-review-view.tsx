"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  FileSpreadsheet,
  History,
  Loader2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportRowCategoryField } from "@/components/finance/import-row-category-field";
import { CategorySuggestionOriginChip } from "@/components/finance/category-suggestion-origin-chip";
import { ImportCategoryReviewPanel } from "@/components/finance/integracoes/import-category-review-panel";
import { upsertCategoryInList } from "@/lib/finance/category-list-utils";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { PageIntro } from "@/components/layout/page-intro";
import { useConfirm } from "@/components/feedback/confirm-dialog-provider";
import { AccountIdentityMark } from "@/components/finance/account-identity";
import { InvoicePaymentImportPanel } from "@/components/finance/integracoes/invoice-payment-import-panel";
import { ImportReviewNarrativeHeader } from "@/components/finance/integracoes/import-review-narrative-header";
import { ImportReviewMobileCommitBar } from "@/components/finance/integracoes/import-review-mobile-commit-bar";
import {
  ImportReviewMobileSection,
  type ImportReviewMobileSectionId,
} from "@/components/finance/integracoes/import-review-mobile-section";
import { useAppContext } from "@/contexts/app-context";
import {
  fetchCardStatementCyclesForAccount,
  parseStatementDueDateFromFileName,
  type CardStatementCycleRecord,
} from "@/lib/finance/card-statement-cycles";
import { buildImportPreview } from "@/lib/integrations/core/import-orchestrator";
import {
  identifyImportFile,
} from "@/lib/integrations/core/identify-import-file";
import { buildImportFileConfirmation } from "@/lib/integrations/core/import-file-confirmation";
import { formatImportMobileCommitSummary } from "@/lib/integrations/core/import-mobile-commit-summary";
import { resolveImportDestinationCardAccountId } from "@/lib/integrations/core/resolve-import-destination-card";
import {
  formatPlannedImportBanksSummary,
  getImportFileSelectHint,
  getImportLayoutBySource,
  getImportReviewPageIntro,
  getSupportedImportBankSummaries,
} from "@/lib/integrations/catalog/import-integrations";
import { getImportSourceProvider } from "@/lib/integrations/providers/registry";
import {
  commitImportPreview,
  getCommitImportPreviewValidationError,
} from "@/lib/integrations/commit/commit-import-preview";
import {
  buildImportSkippedRowsMessage,
  formatCommitSkippedSourceLines,
  type CommitSkippedImportRow,
} from "@/lib/integrations/commit/filter-commit-duplicates";
import { getCommittableImportRows } from "@/lib/integrations/commit/map-import-row";
import {
  buildImportDuplicateAttention,
  getImportRowDuplicateReason,
} from "@/lib/integrations/core/import-duplicate-attention";
import { buildImportReviewDiagnosis } from "@/lib/integrations/core/import-review-diagnosis";
import {
  buildImportReviewContext,
  collectUniqueInvoicePeriodLabels,
} from "@/lib/integrations/core/import-review-context";
import { buildImportFinancialSummary } from "@/lib/integrations/core/import-financial-summary";
import {
  applyAmountMatchRecommendationToCycleTargetOptions,
  applyAmountMatchRecommendationToDueDateOptions,
  applyUniqueAmountMatchToCycleTargetSelection,
  recommendImportedInvoicePaymentTargetByAmount,
  type InvoicePaymentAmountMatchRecommendation,
} from "@/lib/integrations/invoice-payment/recommend-invoice-payment-target-by-amount";
import {
  inferImportStatementClosing,
  resolveMaterializedImportStatementFileCycle,
} from "@/lib/integrations/invoice-payment/infer-import-statement-closing";
import {
  buildInvoicePaymentCycleTargetOptions,
  buildInvoicePaymentDueDateOptions,
  buildInvoicePaymentFutureCycleOptions,
  getInvoicePaymentCycleTargetSelection,
  hydrateInvoicePaymentCycleTargetSelection,
  resolveImportedInvoicePaymentCycleId,
  type InvoicePaymentCycleResolveContext,
  type InvoicePaymentCycleTargetSelection,
  type InvoicePaymentFileCycle,
} from "@/lib/integrations/invoice-payment/invoice-payment-cycle-target";
import {
  getInvoicePaymentImportMode,
  resolveImportedInvoicePaymentForAccount,
  type InvoicePaymentImportMode,
} from "@/lib/integrations/invoice-payment/resolve-invoice-payment";
import {
  getInvoicePaymentReconcileDecision,
  INVOICE_PAYMENT_RECONCILE_MAX_DATE_DAYS,
  suggestInvoicePaymentReconcileForRows,
  type InvoicePaymentReconcileDecision,
  type InvoicePaymentReconcileSuggestion,
  type ManualInvoicePaymentCandidate,
} from "@/lib/integrations/invoice-payment/suggest-invoice-payment-reconcile";
import { fetchManualInvoicePaymentCandidates } from "@/lib/finance/reconcile-invoice-payment";
import { fetchAllTransactionsForAccounts } from "@/lib/finance/fetch-transactions";
import {
  buildPreviewPurchaseSettlementTransactions,
  getInvoicePaymentEstimateTransactionWindow,
  mapPersistedRowsToSettlementTransactions,
  mergeSettlementTransactionsForEstimate,
} from "@/lib/integrations/invoice-payment/invoice-payment-cycle-estimate";
import type { StatementSettlementTransaction } from "@/lib/finance/credit-card-billing";
import { addDaysIso, getCreditCardBillingConfig } from "@/lib/finance/credit-card-billing";
import { formatAccountSelectLabel } from "@/lib/finance/account-identity";
import {
  applyConfirmedCategoryToRow,
  enrichPreviewWithCategorySuggestions,
  fetchCategoryHistoryTransactions,
  mapCategoriesToSuggestionCatalog,
  resolveImportCategoryStatusLabel,
  withCategorySummary,
} from "@/lib/integrations/categories/category-suggestion-service";
import { formatCategorySuggestionConfidencePt } from "@/lib/integrations/categories/category-suggestion-origin";
import {
  getImportRowSelectedCategoryId,
  syncImportRowsAfterCategorySaved,
} from "@/lib/integrations/categories/import-category-actions";
import type { ImportCategoryFeedback } from "@/lib/integrations/categories/import-category-feedback";
import {
  buildImportCategoryFeedbackForSave,
  isImportCategoryFeedbackActive,
  pruneExpiredImportCategoryFeedback,
} from "@/lib/integrations/categories/import-category-feedback";
import type { ImportCategoryReviewMode } from "@/lib/integrations/categories/import-category-review";
import {
  applyCategoryPropagation,
  type ImportCategoryPropagationOffer,
} from "@/lib/integrations/categories/import-category-propagation";
import { resolveImportRowTransactionType } from "@/lib/integrations/categories/category-suggester";
import {
  fetchHiddenSystemCategoryIds,
  filterActiveCategories,
} from "@/lib/finance/active-categories";
import { fetchUserCategoryKeywords } from "@/lib/finance/user-category-keywords";
import {
  createEmptyHistoryContext,
  enrichImportPreviewWithHistory,
} from "@/lib/integrations/history/compare-preview-with-history";
import { hashImportContentAsync } from "@/lib/integrations/history/hash-content";
import { fetchImportHistoryContext } from "@/lib/integrations/history/import-history-service";
import {
  getGuidedReimportIntro,
  IMPORTACOES_ROUTES,
  parseGuidedReimportSearchParams,
} from "@/lib/integrations/history/importations";
import { buildImportRowIdentityKey } from "@/lib/integrations/history/row-identity";
import {
  importDirectionLabels,
  importHistoricalStatusLabels,
  importKindLabels,
  importReviewStatusLabels,
  importSourceLabels,
} from "@/lib/integrations/ui/labels";
import type {
  ImportCategoryStatus,
  ImportPreview,
  ImportPreviewRow,
  ImportReviewStatus,
  ImportRowHistoricalStatus,
} from "@/lib/integrations/types";
import type { Category } from "@/types/category";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { filterRealAccounts, type Account } from "@/types/account";

type RowFilter =
  | "all"
  | "ready"
  | "needs_review"
  | "invalid"
  | "new"
  | "already_imported";

const reviewStatusBadgeClass: Record<ImportReviewStatus, string> = {
  ready: "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  needs_account: "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  possible_duplicate:
    "border-orange-500/25 bg-orange-500/5 text-orange-700 dark:text-orange-400",
  already_imported:
    "border-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-400",
  possible_historical_conflict:
    "border-fuchsia-500/25 bg-fuchsia-500/5 text-fuchsia-700 dark:text-fuchsia-400",
  invalid: "border-destructive/25 bg-destructive/5 text-destructive",
};

const historicalStatusBadgeClass: Record<ImportRowHistoricalStatus, string> = {
  new: "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  already_imported:
    "border-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-400",
  possible_historical_conflict:
    "border-fuchsia-500/25 bg-fuchsia-500/5 text-fuchsia-700 dark:text-fuchsia-400",
};

const filterOptions: { value: RowFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "new", label: "Novas" },
  { value: "already_imported", label: "Já importadas" },
  { value: "ready", label: "Prontos" },
  { value: "needs_review", label: "Precisam revisão" },
  { value: "invalid", label: "Inválidos" },
];

function filterRows(rows: ImportPreviewRow[], filter: RowFilter) {
  switch (filter) {
    case "ready":
      return rows.filter((row) => row.reviewStatus === "ready");
    case "needs_review":
      return rows.filter((row) => row.reviewStatus !== "ready");
    case "invalid":
      return rows.filter((row) => row.reviewStatus === "invalid");
    case "new":
      return rows.filter((row) => row.historicalStatus === "new");
    case "already_imported":
      return rows.filter((row) => row.historicalStatus === "already_imported");
    default:
      return rows;
  }
}

const categoryStatusBadgeClass: Record<ImportCategoryStatus, string> = {
  none: "border-border bg-muted/40 text-muted-foreground",
  suggested: "border-sky-500/25 bg-sky-500/5 text-sky-700 dark:text-sky-300",
  confirmed:
    "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
};

function CategoryStatusBadge({ row }: { row: ImportPreviewRow }) {
  const status = row.categoryStatus ?? "none";

  return (
    <Badge variant="outline" className={categoryStatusBadgeClass[status]}>
      {resolveImportCategoryStatusLabel(status)}
      {row.categorySuggestion && status === "suggested" ? (
        <span className="ml-1 text-[10px]">
          {formatCategorySuggestionConfidencePt(row.categorySuggestion.confidence)}
        </span>
      ) : null}
    </Badge>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ImportReviewDiagnosisCard({
  diagnosis,
}: {
  diagnosis: ReturnType<typeof buildImportReviewDiagnosis>;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/15 px-4 py-4">
      <p className="text-sm font-medium text-foreground">{diagnosis.headline}</p>
      {diagnosis.kindBreakdown.length > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {diagnosis.kindBreakdown
            .map((item) => `${item.count} ${item.label.toLowerCase()}`)
            .join(" · ")}
        </p>
      ) : null}
      {diagnosis.attentionItems.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-border/40 pt-3">
          {diagnosis.attentionItems.map((item) => (
            <li
              key={item.id}
              className="text-sm text-amber-800 dark:text-amber-200/90"
            >
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ImportReviewContextLine({
  context,
}: {
  context: NonNullable<ReturnType<typeof buildImportReviewContext>>;
}) {
  return (
    <p className="text-sm text-muted-foreground">{context.headline}</p>
  );
}

const DUPLICATE_ATTENTION_PREVIEW_LIMIT = 8;

function ImportDuplicateAttentionCard({
  attention,
}: {
  attention: NonNullable<ReturnType<typeof buildImportDuplicateAttention>>;
}) {
  const previewLines = attention.lines.slice(0, DUPLICATE_ATTENTION_PREVIEW_LIMIT);
  const hiddenCount = attention.lines.length - previewLines.length;

  return (
    <Card className="border-amber-500/20 shadow-sm">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">Atenção com possíveis duplicatas</CardTitle>
        <p className="text-sm font-medium text-foreground">{attention.headline}</p>
        {attention.outcomeSummary ? (
          <p className="text-sm text-muted-foreground">{attention.outcomeSummary}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {attention.groups
          .filter((group) => group.sourceLines.length > 1 || group.keptSourceLine !== null)
          .map((group) => (
            <p key={group.id} className="text-xs text-muted-foreground">
              {group.keptSourceLine != null
                ? `Linhas ${group.sourceLines.join(", ")} — a linha ${group.keptSourceLine} permanece; as demais ficam de fora porque têm ${group.reason}.`
                : `${group.sourceLines.length} linha(s): ${group.reason}.`}
            </p>
          ))}

        <div className="space-y-2">
          {previewLines.map((line) => (
            <div
              key={`dup-line-${line.sourceLine}`}
              className="rounded-xl border border-amber-500/15 bg-amber-500/5 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    Linha {line.sourceLine} — {line.description}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {line.dateLabel} · {line.amountLabel}
                  </p>
                  <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
                    Motivo: {line.reason}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    line.willImport
                      ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                      : "border-amber-500/25 bg-amber-500/5 text-amber-800 dark:text-amber-200"
                  }
                >
                  {line.willImport ? "Será gravado" : "Ficará de fora"}
                </Badge>
              </div>
            </div>
          ))}
          {hiddenCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              e mais {hiddenCount} linha(s) com o mesmo tipo de atenção.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ImportRowBadges({
  row,
  isDuplicate,
}: {
  row: ImportPreviewRow;
  isDuplicate: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge
        variant="outline"
        className={historicalStatusBadgeClass[row.historicalStatus]}
      >
        {importHistoricalStatusLabels[row.historicalStatus]}
      </Badge>
      <Badge variant="outline" className={reviewStatusBadgeClass[row.reviewStatus]}>
        {importReviewStatusLabels[row.reviewStatus]}
      </Badge>
      {row.kind === "card_invoice_payment" ? (
        <Badge className="border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300">
          Pagamento de fatura
        </Badge>
      ) : null}
      {isDuplicate ? (
        <Badge variant="outline" className={reviewStatusBadgeClass.possible_duplicate}>
          Possível duplicata
        </Badge>
      ) : null}
      {row.metadata.reversalPair ? (
        <Badge variant="outline" className="border-sky-500/25 bg-sky-500/5 text-sky-700 dark:text-sky-300">
          Estorno vinculado
        </Badge>
      ) : null}
      <CategoryStatusBadge row={row} />
      {row.reviewStatus === "already_imported" ? (
        <Badge variant="outline" className={reviewStatusBadgeClass.already_imported}>
          Histórico
        </Badge>
      ) : null}
      {row.reviewStatus === "invalid" ? (
        <Badge variant="destructive">Inválida</Badge>
      ) : null}
    </div>
  );
}

export function ImportReviewView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient()!, []);
  const confirm = useConfirm();
  const { user, activeFamily } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const guidedReimport = useMemo(
    () => parseGuidedReimportSearchParams(searchParams),
    [searchParams],
  );
  const [guidedAccountApplied, setGuidedAccountApplied] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [contentHash, setContentHash] = useState<string | null>(null);
  const [cardAccountId, setCardAccountId] = useState("");
  const [checkingAccountId, setCheckingAccountId] = useState("");
  const [statementClosingDate, setStatementClosingDate] = useState("");
  const [statementDueDate, setStatementDueDate] = useState("");
  const [confirmLowConfidenceClosing, setConfirmLowConfidenceClosing] =
    useState(false);
  const [importedStatementCycles, setImportedStatementCycles] = useState<
    CardStatementCycleRecord[]
  >([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitSkippedRows, setCommitSkippedRows] = useState<
    CommitSkippedImportRow[]
  >([]);
  const [categoryReviewMode, setCategoryReviewMode] =
    useState<ImportCategoryReviewMode>("assisted");
  const [showFullCategoryList, setShowFullCategoryList] = useState(false);
  const [propagationOffer, setPropagationOffer] = useState<
    ImportCategoryPropagationOffer | null
  >(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [keywordsByCategoryId, setKeywordsByCategoryId] = useState<
    Map<string, string[]>
  >(() => new Map());
  const [categoryRows, setCategoryRows] = useState<ImportPreviewRow[]>([]);
  const [categoryFeedbackByLine, setCategoryFeedbackByLine] = useState<
    Record<number, ImportCategoryFeedback>
  >({});
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [invoiceSourceAccounts, setInvoiceSourceAccounts] = useState<
    Record<number, string>
  >({});
  const [invoicePaymentModes, setInvoicePaymentModes] = useState<
    Record<number, InvoicePaymentImportMode>
  >({});
  const [invoicePaymentCycleTargets, setInvoicePaymentCycleTargets] = useState<
    Record<number, InvoicePaymentCycleTargetSelection>
  >({});
  const [invoiceReconcileDecisions, setInvoiceReconcileDecisions] = useState<
    Record<number, InvoicePaymentReconcileDecision>
  >({});
  const [manualInvoiceCandidates, setManualInvoiceCandidates] = useState<
    ManualInvoicePaymentCandidate[]
  >([]);
  const [cardSettlementTransactions, setCardSettlementTransactions] = useState<
    StatementSettlementTransaction[]
  >([]);
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [readingFile, setReadingFile] = useState(false);
  const [fileConfirmed, setFileConfirmed] = useState(false);
  const [showOtherRows, setShowOtherRows] = useState(true);
  const [mobileOpenSection, setMobileOpenSection] =
    useState<ImportReviewMobileSectionId | null>(null);

  const identifiedFile = useMemo(
    () => (csvContent ? identifyImportFile(csvContent) : null),
    [csvContent],
  );

  const fileConfirmation = useMemo(() => {
    if (!csvContent || identifiedFile?.status !== "supported") {
      return null;
    }
    return buildImportFileConfirmation(csvContent, identifiedFile);
  }, [csvContent, identifiedFile]);

  const detectedSource =
    identifiedFile?.status === "supported" ? identifiedFile.source : null;

  const detectedLayout = detectedSource
    ? getImportLayoutBySource(detectedSource)
    : null;
  const runtimeProvider = detectedSource
    ? getImportSourceProvider(detectedSource)
    : null;
  const requiresCardAccount = Boolean(runtimeProvider?.requiresCardAccount);
  const requiresCheckingAccount = detectedLayout?.kind === "checking";

  const targetAccountId = requiresCardAccount
    ? cardAccountId
    : requiresCheckingAccount
      ? checkingAccountId
      : "";

  const basePreview: ImportPreview | null = useMemo(() => {
    if (!csvContent || !detectedSource || !fileConfirmed) {
      return null;
    }

    if (requiresCardAccount && !cardAccountId) {
      return null;
    }

    return buildImportPreview({
      content: csvContent,
      cardAccountId: cardAccountId || undefined,
    });
  }, [
    cardAccountId,
    csvContent,
    detectedSource,
    fileConfirmed,
    requiresCardAccount,
  ]);

  const creditCardAccounts = useMemo(
    () =>
      filterRealAccounts(accounts).filter(
        (account) => account.type === "credit_card",
      ),
    [accounts],
  );

  const checkingAccounts = useMemo(
    () =>
      filterRealAccounts(accounts).filter((account) =>
        ["checking", "savings"].includes(account.type),
      ),
    [accounts],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadHistoricalPreview() {
      if (!basePreview || !csvContent) {
        setPreview(basePreview);
        return;
      }

      if (!targetAccountId) {
        setPreview(basePreview);
        setHistoryError(null);
        return;
      }

      if (!user) {
        setPreview(basePreview);
        return;
      }

      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const contentHash = await hashImportContentAsync(csvContent);
        const identityKeys = basePreview.rows.map((row) =>
          buildImportRowIdentityKey(row, targetAccountId),
        );
        const externalIds = basePreview.rows
          .map((row) => row.externalId)
          .filter(Boolean) as string[];

        let history;
        try {
          history = await fetchImportHistoryContext(supabase, {
            ownerUserId: user.id,
            accountId: targetAccountId,
            contentHash,
            identityKeys,
            externalIds,
          });
        } catch {
          history = createEmptyHistoryContext(contentHash);
          if (!cancelled) {
            setHistoryError(
              "Não foi possível consultar o histórico remoto. O preview mostra apenas dedupe intra-arquivo.",
            );
          }
        }

        if (!cancelled) {
          setPreview(
            enrichImportPreviewWithHistory(basePreview, history, targetAccountId),
          );
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    void loadHistoricalPreview();

    return () => {
      cancelled = true;
    };
  }, [basePreview, csvContent, supabase, targetAccountId, user, historyRefreshKey]);

  const categoryCatalog = useMemo(
    () => mapCategoriesToSuggestionCatalog(categories, keywordsByCategoryId),
    [categories, keywordsByCategoryId],
  );

  const displayPreview: ImportPreview | null = useMemo(() => {
    if (!preview) {
      return null;
    }

    if (categoryRows.length === 0) {
      return preview;
    }

    return withCategorySummary(preview, categoryRows);
  }, [categoryRows, preview]);

  const activePreview = displayPreview ?? preview;

  const duplicateSourceLines = useMemo(() => {
    if (!activePreview) {
      return new Set<number>();
    }

    return new Set(
      activePreview.possibleDuplicates.flatMap((group) => group.sourceLines),
    );
  }, [activePreview]);

  const filteredRows = useMemo(() => {
    if (!activePreview) {
      return [];
    }

    return filterRows(activePreview.rows, rowFilter);
  }, [activePreview, rowFilter]);

  const selectedCardAccount = useMemo(
    () => creditCardAccounts.find((account) => account.id === cardAccountId) ?? null,
    [cardAccountId, creditCardAccounts],
  );

  const cardBillingConfig = useMemo(
    () => getCreditCardBillingConfig(selectedCardAccount),
    [selectedCardAccount],
  );

  const statementClosingInference = useMemo(() => {
    if (!requiresCardAccount || !statementDueDate) {
      return null;
    }

    return inferImportStatementClosing({
      dueDate: statementDueDate,
      userClosingDate: statementClosingDate || null,
      billingConfig: cardBillingConfig,
      importedCycles: importedStatementCycles,
    });
  }, [
    cardBillingConfig,
    importedStatementCycles,
    requiresCardAccount,
    statementClosingDate,
    statementDueDate,
  ]);

  const statementFileCycle = useMemo((): InvoicePaymentFileCycle | null => {
    if (!requiresCardAccount || !statementDueDate) {
      return null;
    }

    const materialized = resolveMaterializedImportStatementFileCycle({
      dueDate: statementDueDate,
      userClosingDate: statementClosingDate || null,
      billingConfig: cardBillingConfig,
      importedCycles: importedStatementCycles,
      confirmLowConfidenceClosing,
    });

    return materialized.ok ? materialized.cycle : null;
  }, [
    cardBillingConfig,
    confirmLowConfidenceClosing,
    importedStatementCycles,
    requiresCardAccount,
    statementClosingDate,
    statementDueDate,
  ]);

  const invoicePaymentCycleResolveContext =
    useMemo((): InvoicePaymentCycleResolveContext => {
      return {
        fileCycle: statementFileCycle,
        importedCycles: importedStatementCycles,
      };
    }, [importedStatementCycles, statementFileCycle]);

  const invoicePaymentSettlementTransactions = useMemo(() => {
    if (!activePreview || !cardAccountId) {
      return [] as StatementSettlementTransaction[];
    }

    const previewPurchases = buildPreviewPurchaseSettlementTransactions({
      cardAccountId,
      previewRows: activePreview.rows,
    });

    return mergeSettlementTransactionsForEstimate(
      cardSettlementTransactions,
      previewPurchases,
    );
  }, [activePreview, cardAccountId, cardSettlementTransactions]);

  const invoicePaymentCycleContext = useMemo(() => {
    if (!activePreview || !cardBillingConfig) {
      return {} as Record<
        number,
        {
          options: ReturnType<typeof buildInvoicePaymentCycleTargetOptions>;
          futureOptions: ReturnType<typeof buildInvoicePaymentFutureCycleOptions>;
          dueDateOptions: ReturnType<typeof buildInvoicePaymentDueDateOptions>;
          selection: InvoicePaymentCycleTargetSelection;
          amountRecommendation: InvoicePaymentAmountMatchRecommendation;
        }
      >;
    }

    const context: Record<
      number,
      {
        options: ReturnType<typeof buildInvoicePaymentCycleTargetOptions>;
        futureOptions: ReturnType<typeof buildInvoicePaymentFutureCycleOptions>;
        dueDateOptions: ReturnType<typeof buildInvoicePaymentDueDateOptions>;
        selection: InvoicePaymentCycleTargetSelection;
        amountRecommendation: InvoicePaymentAmountMatchRecommendation;
      }
    > = {};

    for (const row of activePreview.rows) {
      if (row.kind !== "card_invoice_payment") {
        continue;
      }

      const rawSelection = getInvoicePaymentCycleTargetSelection(
        invoicePaymentCycleTargets,
        row.sourceLine,
      );

      const amountRecommendation = recommendImportedInvoicePaymentTargetByAmount({
        paymentAmount: row.amount,
        paymentDate: row.date,
        importedCycles: importedStatementCycles,
        billingConfig: cardBillingConfig,
        cardAccountId: cardAccountId || undefined,
        settlementTransactions: invoicePaymentSettlementTransactions,
        context: invoicePaymentCycleResolveContext,
      });

      const hydrated = hydrateInvoicePaymentCycleTargetSelection(
        applyUniqueAmountMatchToCycleTargetSelection({
          selection: rawSelection,
          recommendation: amountRecommendation,
          billingConfig: cardBillingConfig,
          paymentDate: row.date,
          context: invoicePaymentCycleResolveContext,
        }),
        cardBillingConfig,
        row.date,
        invoicePaymentCycleResolveContext,
      );

      const options = applyAmountMatchRecommendationToCycleTargetOptions(
        buildInvoicePaymentCycleTargetOptions(
          cardBillingConfig,
          row.date,
          invoicePaymentCycleResolveContext,
        ),
        amountRecommendation,
      );

      const dueDateOptions = applyAmountMatchRecommendationToDueDateOptions(
        buildInvoicePaymentDueDateOptions(
          cardBillingConfig,
          row.date,
          invoicePaymentCycleResolveContext,
        ),
        amountRecommendation,
      );

      context[row.sourceLine] = {
        options,
        futureOptions: buildInvoicePaymentFutureCycleOptions(
          cardBillingConfig,
          row.date,
          6,
          invoicePaymentCycleResolveContext,
        ),
        dueDateOptions,
        selection: hydrated,
        amountRecommendation,
      };
    }

    return context;
  }, [
    activePreview,
    cardAccountId,
    cardBillingConfig,
    importedStatementCycles,
    invoicePaymentCycleResolveContext,
    invoicePaymentCycleTargets,
    invoicePaymentSettlementTransactions,
  ]);

  useEffect(() => {
    if (!activePreview || !cardBillingConfig) {
      return;
    }

    const patches: Record<number, InvoicePaymentCycleTargetSelection> = {};

    for (const row of activePreview.rows) {
      if (row.kind !== "card_invoice_payment") {
        continue;
      }

      const rawSelection = getInvoicePaymentCycleTargetSelection(
        invoicePaymentCycleTargets,
        row.sourceLine,
      );
      if (rawSelection.targetDueDate) {
        continue;
      }

      const recommendation =
        invoicePaymentCycleContext[row.sourceLine]?.amountRecommendation;
      if (!recommendation || recommendation.kind !== "unique") {
        continue;
      }

      patches[row.sourceLine] = applyUniqueAmountMatchToCycleTargetSelection({
        selection: rawSelection,
        recommendation,
        billingConfig: cardBillingConfig,
        paymentDate: row.date,
        context: invoicePaymentCycleResolveContext,
      });
    }

    const patchLines = Object.keys(patches);
    if (patchLines.length === 0) {
      return;
    }

    setInvoicePaymentCycleTargets((current) => {
      let changed = false;
      const next = { ...current };
      for (const [line, selection] of Object.entries(patches)) {
        const sourceLine = Number(line);
        if (current[sourceLine]?.targetDueDate) {
          continue;
        }
        next[sourceLine] = selection;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [
    activePreview,
    cardBillingConfig,
    invoicePaymentCycleContext,
    invoicePaymentCycleResolveContext,
    invoicePaymentCycleTargets,
  ]);

  const invoicePaymentRows = useMemo(
    () =>
      (activePreview?.rows ?? []).filter(
        (row) => row.kind === "card_invoice_payment",
      ),
    [activePreview],
  );

  const importFinancialSummary = useMemo(
    () =>
      activePreview
        ? buildImportFinancialSummary({
            rows: activePreview.rows,
            source: activePreview.source,
            invoicePaymentModes,
          })
        : null,
    [activePreview, invoicePaymentModes],
  );

  useEffect(() => {
    if (invoicePaymentRows.length > 0) {
      setShowOtherRows(false);
    }
  }, [invoicePaymentRows.length, activePreview?.source]);

  useEffect(() => {
    if (!activePreview) {
      setMobileOpenSection(null);
      return;
    }

    setMobileOpenSection(
      invoicePaymentRows.length > 0 ? "payment" : "context",
    );
  }, [
    activePreview?.source,
    activePreview?.summary.totalRows,
    invoicePaymentRows.length,
  ]);

  function setExclusiveMobileSection(
    section: ImportReviewMobileSectionId,
    open: boolean,
  ) {
    setMobileOpenSection((current) => {
      if (open) {
        return section;
      }
      return current === section ? null : current;
    });

    if (open && section === "other") {
      setShowOtherRows(true);
    }
  }

  const invoiceReconcileSuggestions = useMemo(() => {
    if (!activePreview || !cardAccountId || detectedSource !== "nubank_credit_card") {
      return {} as Record<number, InvoicePaymentReconcileSuggestion>;
    }

    const rows = activePreview.rows
      .filter((row) => row.kind === "card_invoice_payment")
      .filter(
        (row) =>
          getInvoicePaymentImportMode(invoicePaymentModes, row.sourceLine) ===
          "payment",
      )
      .map((row) => {
        const resolution = resolveImportedInvoicePaymentForAccount({
          paymentDate: row.date,
          cardAccount: selectedCardAccount,
        });

        return {
          sourceLine: row.sourceLine,
          imported: {
            amount: row.amount,
            paymentDate: row.date,
            cycleId:
              resolveImportedInvoicePaymentCycleId({
                billingConfig: cardBillingConfig,
                paymentDate: row.date,
                selection: getInvoicePaymentCycleTargetSelection(
                  invoicePaymentCycleTargets,
                  row.sourceLine,
                ),
                context: invoicePaymentCycleResolveContext,
              }) ??
              resolution?.cycleId ??
              null,
            cardAccountId,
            sourceAccountId: invoiceSourceAccounts[row.sourceLine] ?? null,
          },
        };
      });

    return suggestInvoicePaymentReconcileForRows({
      rows,
      candidates: manualInvoiceCandidates,
    });
  }, [
    activePreview,
    cardAccountId,
    cardBillingConfig,
    detectedSource,
    invoicePaymentCycleResolveContext,
    invoicePaymentCycleTargets,
    invoicePaymentModes,
    invoiceSourceAccounts,
    manualInvoiceCandidates,
    selectedCardAccount,
  ]);

  const committableRows = useMemo(() => {
    if (!activePreview) {
      return [];
    }

    return getCommittableImportRows(
      activePreview.rows,
      invoiceSourceAccounts,
      invoicePaymentModes,
    );
  }, [activePreview, invoicePaymentModes, invoiceSourceAccounts]);

  const reviewDiagnosis = useMemo(() => {
    if (!activePreview) {
      return null;
    }

    return buildImportReviewDiagnosis({
      rows: activePreview.rows,
      invoiceSourceAccounts,
      invoicePaymentModes,
    });
  }, [activePreview, invoicePaymentModes, invoiceSourceAccounts]);

  const reviewContext = useMemo(() => {
    if (!activePreview) {
      return null;
    }

    const destinationAccount =
      accounts.find((account) => account.id === targetAccountId) ?? null;

    const invoicePeriodLabels = collectUniqueInvoicePeriodLabels(
      activePreview.rows
        .filter((row) => row.kind === "card_invoice_payment")
        .map(
          (row) =>
            resolveImportedInvoicePaymentForAccount({
              paymentDate: row.date,
              cardAccount: selectedCardAccount,
            })?.periodLabel,
        ),
    );

    return buildImportReviewContext({
      destinationAccountLabel: destinationAccount
        ? formatAccountSelectLabel(destinationAccount)
        : null,
      rows: activePreview.rows,
      invoicePeriodLabels,
    });
  }, [accounts, activePreview, selectedCardAccount, targetAccountId]);

  const duplicateAttention = useMemo(() => {
    if (!activePreview) {
      return null;
    }

    return buildImportDuplicateAttention({
      rows: activePreview.rows,
      possibleDuplicates: activePreview.possibleDuplicates,
      committableSourceLines: new Set(
        committableRows.map((row) => row.sourceLine),
      ),
    });
  }, [activePreview, committableRows]);

  const commitValidationError = useMemo(() => {
    if (!activePreview || !user || !contentHash || !targetAccountId) {
      return "Selecione arquivo, conta e aguarde o preview.";
    }

    return getCommitImportPreviewValidationError({
      preview: activePreview,
      targetAccountId,
      invoiceSourceAccounts,
      invoicePaymentModes,
      ownerUserId: user.id,
      familyId: activeFamily?.id ?? null,
      fileName,
      contentHash,
      targetAccount: selectedCardAccount,
      statementDueDate,
      statementClosingDate: statementClosingDate || null,
      confirmLowConfidenceClosing,
      statementFileCycle,
      importedStatementCycles,
    });
  }, [
    activeFamily?.id,
    activePreview,
    confirmLowConfidenceClosing,
    contentHash,
    fileName,
    importedStatementCycles,
    invoicePaymentModes,
    invoiceSourceAccounts,
    selectedCardAccount,
    statementClosingDate,
    statementDueDate,
    statementFileCycle,
    targetAccountId,
    user,
  ]);

  useEffect(() => {
    if (checkingAccounts.length !== 1) {
      return;
    }

    const onlyId = checkingAccounts[0]!.id;
    if (!activePreview) {
      return;
    }

    const paymentLines = activePreview.rows
      .filter((row) => row.kind === "card_invoice_payment")
      .map((row) => row.sourceLine);

    if (paymentLines.length === 0) {
      return;
    }

    setInvoiceSourceAccounts((current) => {
      const next = { ...current };
      let changed = false;
      for (const line of paymentLines) {
        if (!next[line]) {
          next[line] = onlyId;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [activePreview, checkingAccounts]);

  useEffect(() => {
    let cancelled = false;

    async function loadManualInvoiceCandidates() {
      if (
        !activePreview ||
        !cardAccountId ||
        detectedSource !== "nubank_credit_card"
      ) {
        setManualInvoiceCandidates([]);
        return;
      }

      const paymentRows = activePreview.rows.filter(
        (row) => row.kind === "card_invoice_payment",
      );

      if (paymentRows.length === 0) {
        setManualInvoiceCandidates([]);
        return;
      }

      const dates = paymentRows.map((row) => row.date).sort();
      const earliest = dates[0]!;
      const latest = dates[dates.length - 1]!;

      // Widen the window so manuals paid a few days earlier/later still load.
      const pad = INVOICE_PAYMENT_RECONCILE_MAX_DATE_DAYS;
      const dateFrom = addDaysIso(earliest, -pad);
      const dateTo = addDaysIso(latest, pad);

      const { candidates, error } = await fetchManualInvoicePaymentCandidates(
        supabase,
        {
          cardAccountId,
          dateFrom,
          dateTo,
        },
      );

      if (cancelled) {
        return;
      }

      if (error) {
        console.error(error);
        setManualInvoiceCandidates([]);
        return;
      }

      setManualInvoiceCandidates(candidates);
    }

    void loadManualInvoiceCandidates();

    return () => {
      cancelled = true;
    };
  }, [activePreview, cardAccountId, detectedSource, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function loadCardSettlementTransactions() {
      if (
        !activePreview ||
        !cardAccountId ||
        !cardBillingConfig ||
        detectedSource !== "nubank_credit_card"
      ) {
        setCardSettlementTransactions([]);
        return;
      }

      const paymentRows = activePreview.rows.filter(
        (row) => row.kind === "card_invoice_payment",
      );

      if (paymentRows.length === 0) {
        setCardSettlementTransactions([]);
        return;
      }

      const window = getInvoicePaymentEstimateTransactionWindow({
        billingConfig: cardBillingConfig,
        paymentDates: paymentRows.map((row) => row.date),
        context: invoicePaymentCycleResolveContext,
      });

      const { data, error } = await fetchAllTransactionsForAccounts<{
        amount: number;
        type: "income" | "expense" | "transfer";
        account_id: string;
        transaction_date: string;
        statement_cycle_id: string | null;
        invoice_payment_origin: "manual" | "imported" | null;
        reconciled_with_transaction_id: string | null;
      }>(supabase, {
        accountIds: [cardAccountId],
        select:
          "amount, type, account_id, transaction_date, statement_cycle_id, invoice_payment_origin, reconciled_with_transaction_id",
        dateFrom: window.dateFrom,
        dateTo: window.dateTo,
      });

      if (cancelled) {
        return;
      }

      if (error) {
        console.error(error);
        setCardSettlementTransactions([]);
        return;
      }

      setCardSettlementTransactions(mapPersistedRowsToSettlementTransactions(data));
    }

    void loadCardSettlementTransactions();

    return () => {
      cancelled = true;
    };
  }, [
    activePreview,
    cardAccountId,
    cardBillingConfig,
    detectedSource,
    invoicePaymentCycleResolveContext,
    supabase,
  ]);

  useEffect(() => {
    if (!fileName || statementDueDate) {
      return;
    }

    const dueFromFile = parseStatementDueDateFromFileName(fileName);
    if (dueFromFile) {
      setStatementDueDate(dueFromFile);
    }
  }, [fileName, statementDueDate]);

  useEffect(() => {
    if (
      !cardBillingConfig ||
      !statementDueDate ||
      statementClosingDate ||
      !statementClosingInference ||
      statementClosingInference.confidence !== "high"
    ) {
      return;
    }

    setStatementClosingDate(statementClosingInference.closingDate);
  }, [
    cardBillingConfig,
    statementClosingDate,
    statementClosingInference,
    statementDueDate,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadImportedCycles() {
      if (!cardAccountId || detectedSource !== "nubank_credit_card") {
        setImportedStatementCycles([]);
        return;
      }

      const result = await fetchCardStatementCyclesForAccount(
        supabase,
        cardAccountId,
      );

      if (cancelled) {
        return;
      }

      if (result.errorMessage) {
        console.error(result.errorMessage);
        setImportedStatementCycles([]);
        return;
      }

      setImportedStatementCycles(result.cycles);
    }

    void loadImportedCycles();

    return () => {
      cancelled = true;
    };
  }, [cardAccountId, detectedSource, supabase]);

  useEffect(() => {
    async function loadAccounts() {
      setAccountsLoading(true);

      const { data, error } = await supabase
        .from("accounts")
        .select("*, families (id, name, slug)")
        .order("created_at", { ascending: false });

      if (!error) {
        setAccounts((data ?? []) as Account[]);
      }

      setAccountsLoading(false);
    }

    void loadAccounts();
  }, [supabase]);

  useEffect(() => {
    if (guidedAccountApplied || accountsLoading || !guidedReimport.accountId) {
      return;
    }

    const account = accounts.find(
      (item) => item.id === guidedReimport.accountId,
    );
    if (!account) {
      setGuidedAccountApplied(true);
      return;
    }

    if (account.type === "credit_card") {
      setCardAccountId(account.id);
    } else if (["checking", "savings"].includes(account.type)) {
      setCheckingAccountId(account.id);
    }

    setGuidedAccountApplied(true);
  }, [
    accounts,
    accountsLoading,
    guidedAccountApplied,
    guidedReimport.accountId,
  ]);

  useEffect(() => {
    if (accountsLoading || !requiresCardAccount) {
      return;
    }

    // Espere a reimportação guiada aplicar a conta pré-selecionada primeiro.
    if (guidedReimport.accountId && !guidedAccountApplied) {
      return;
    }

    const nextCardAccountId = resolveImportDestinationCardAccountId({
      creditCardAccountIds: creditCardAccounts.map((account) => account.id),
      currentCardAccountId: cardAccountId,
    });

    if (nextCardAccountId !== cardAccountId) {
      setCardAccountId(nextCardAccountId);
    }
  }, [
    accountsLoading,
    cardAccountId,
    creditCardAccounts,
    guidedAccountApplied,
    guidedReimport.accountId,
    requiresCardAccount,
  ]);

  const guidedAccountName = useMemo(() => {
    if (!guidedReimport.accountId) return null;
    return (
      accounts.find((account) => account.id === guidedReimport.accountId)?.name ??
      null
    );
  }, [accounts, guidedReimport.accountId]);

  const isGuidedReimport = Boolean(guidedReimport.fromBatchId);

  useEffect(() => {
    if (Object.keys(categoryFeedbackByLine).length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCategoryFeedbackByLine((current) => {
        const next = pruneExpiredImportCategoryFeedback(current);
        return Object.keys(next).length === Object.keys(current).length
          ? current
          : next;
      });
    }, 200);

    return () => window.clearInterval(timer);
  }, [categoryFeedbackByLine]);

  useEffect(() => {
    let cancelled = false;

    async function loadCategorySuggestions() {
      if (!preview || !user) {
        setCategoryRows([]);
        return;
      }

      setCategoriesLoading(true);

      try {
        const [categoriesRes, hiddenIds] = await Promise.all([
          supabase.from("categories").select("*").order("name"),
          fetchHiddenSystemCategoryIds(supabase, user.id),
        ]);

        if (categoriesRes.error) {
          throw categoriesRes.error;
        }

        const loadedCategories = filterActiveCategories(
          ((categoriesRes.data ?? []) as Category[]).map((category) => ({
            ...category,
            is_active: category.is_active ?? true,
          })),
          { hiddenSystemCategoryIds: hiddenIds },
        );

        if (cancelled) {
          return;
        }

        setCategories(loadedCategories);

        const accountIds = filterRealAccounts(accounts).map((account) => account.id);
        const [history, keywordsResult] = await Promise.all([
          fetchCategoryHistoryTransactions(
            supabase,
            accountIds,
            500,
            user.id,
          ),
          fetchUserCategoryKeywords(supabase, user.id),
        ]);
        if (keywordsResult.errorMessage) {
          console.error(keywordsResult.errorMessage);
        }
        if (!cancelled) {
          setKeywordsByCategoryId(keywordsResult.keywordsByCategoryId);
        }
        const catalog = mapCategoriesToSuggestionCatalog(
          loadedCategories,
          keywordsResult.keywordsByCategoryId,
        );
        const enriched = enrichPreviewWithCategorySuggestions(preview, history, catalog);

        if (!cancelled) {
          setCategoryRows(enriched.rows);
        }
      } catch {
        if (!cancelled) {
          setCategoryRows(
            preview.rows.map((row) => ({
              ...row,
              categoryStatus: row.categoryStatus ?? "none",
              confirmedCategoryId: row.confirmedCategoryId ?? null,
            })),
          );
        }
      } finally {
        if (!cancelled) {
          setCategoriesLoading(false);
        }
      }
    }

    void loadCategorySuggestions();

    return () => {
      cancelled = true;
    };
  }, [accounts, preview, supabase, user, historyRefreshKey]);

  function handleCategoryRowsChange(nextRows: ImportPreviewRow[]) {
    setCategoryRows(nextRows);
  }

  function propagateCategoryOnRows(
    baseRows: ImportPreviewRow[],
    sourceLine: number,
    categoryId: string,
    forcePropagate = false,
  ) {
    return applyCategoryPropagation({
      rows: baseRows,
      sourceLine,
      categoryId,
      catalog: categoryCatalog,
      mode: categoryReviewMode,
      forcePropagate,
    });
  }

  function handleRowCategoryChange(sourceLine: number, categoryId: string) {
    const baseRows = categoryRows.length > 0 ? categoryRows : (preview?.rows ?? []);

    if (!categoryId) {
      setPropagationOffer(null);
      setCategoryRows(
        baseRows.map((row) =>
          row.sourceLine === sourceLine
            ? applyConfirmedCategoryToRow(row, null, categoryCatalog)
            : row,
        ),
      );
      return;
    }

    const result = propagateCategoryOnRows(baseRows, sourceLine, categoryId);
    setCategoryRows(result.rows);
    setPropagationOffer(
      result.offer && categoryReviewMode === "assisted" ? result.offer : null,
    );
  }

  function handleImportCategorySaved(
    category: Category,
    sourceLine: number,
    mode: "create" | "update",
  ) {
    const nextCategories = upsertCategoryInList(categories, category);
    const nextCatalog = mapCategoriesToSuggestionCatalog(
      nextCategories,
      keywordsByCategoryId,
    );
    const baseRows = categoryRows.length > 0 ? categoryRows : (preview?.rows ?? []);

    let nextRows = syncImportRowsAfterCategorySaved({
      rows: baseRows,
      category,
      catalog: nextCatalog,
      sourceLine,
      mode,
    });

    setCategories(nextCategories);
    setCategoryFeedbackByLine((feedbackCurrent) => ({
      ...feedbackCurrent,
      ...buildImportCategoryFeedbackForSave({
        rows: nextRows,
        categoryId: category.id,
        sourceLine,
        mode,
      }),
    }));

    if (mode === "create") {
      const propagation = applyCategoryPropagation({
        rows: nextRows,
        sourceLine,
        categoryId: category.id,
        catalog: nextCatalog,
        mode: categoryReviewMode,
      });
      nextRows = propagation.rows;
      setPropagationOffer(
        propagation.offer && categoryReviewMode === "assisted"
          ? propagation.offer
          : null,
      );
    }

    setCategoryRows(nextRows);
  }

  function handleConfirmSuggestion(sourceLine: number) {
    const baseRows = categoryRows.length > 0 ? categoryRows : (preview?.rows ?? []);
    const row = baseRows.find((item) => item.sourceLine === sourceLine);
    if (!row?.categorySuggestion) {
      return;
    }

    const result = propagateCategoryOnRows(
      baseRows,
      sourceLine,
      row.categorySuggestion.categoryId,
    );
    setCategoryRows(result.rows);
    setPropagationOffer(
      result.offer && categoryReviewMode === "assisted" ? result.offer : null,
    );
  }

  function handleAcceptCategoryPropagation() {
    if (!propagationOffer) {
      return;
    }

    const baseRows = categoryRows.length > 0 ? categoryRows : (preview?.rows ?? []);
    const result = propagateCategoryOnRows(
      baseRows,
      propagationOffer.sourceLine,
      propagationOffer.categoryId,
      true,
    );
    setCategoryRows(result.rows);
    setPropagationOffer(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setReadingFile(true);
    setFileName(file.name);
    setFileConfirmed(false);
    setStatementClosingDate("");
    setStatementDueDate("");
    setImportedStatementCycles([]);
    setPreview(null);
    setCategoryFeedbackByLine({});
    setCommitSkippedRows([]);
    setShowFullCategoryList(false);
    setPropagationOffer(null);
    setInvoiceSourceAccounts({});
    setInvoicePaymentModes({});
    setInvoicePaymentCycleTargets({});
    setInvoiceReconcileDecisions({});
    setManualInvoiceCandidates([]);
    setCardSettlementTransactions([]);
    setRowFilter("all");

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : null;
      setCsvContent(text);
      if (text) {
        void hashImportContentAsync(text).then(setContentHash);
      } else {
        setContentHash(null);
      }
      setReadingFile(false);
    };
    reader.onerror = () => {
      setCsvContent(null);
      setContentHash(null);
      setReadingFile(false);
    };
    reader.readAsText(file);
  }

  async function handleCommit() {
    if (!activePreview || !user || !contentHash || !targetAccountId || committing) {
      return;
    }

    if (commitValidationError) {
      toast.error(commitValidationError);
      return;
    }

    const confirmed = await confirm({
      title: "Importar lançamentos",
      description: `Serão gravadas ${committableRows.length} linha(s) nova(s). Linhas já importadas, duplicadas ou pendentes serão ignoradas.`,
      confirmLabel: "Importar",
      cancelLabel: "Cancelar",
    });

    if (!confirmed) {
      return;
    }

    setCommitting(true);
    setCommitSkippedRows([]);

    const targetAccount =
      accounts.find((account) => account.id === targetAccountId) ?? null;

    const result = await commitImportPreview(supabase, {
      preview: activePreview,
      targetAccountId,
      invoiceSourceAccounts,
      invoicePaymentModes,
      invoicePaymentCycleTargets,
      invoicePaymentReconcileDecisions: invoiceReconcileDecisions,
      invoicePaymentReconcileSuggestions: invoiceReconcileSuggestions,
      ownerUserId: user.id,
      familyId: activeFamily?.id ?? null,
      fileName,
      contentHash,
      targetAccount,
      statementDueDate,
      statementClosingDate: statementClosingDate || null,
      confirmLowConfidenceClosing,
      statementFileCycle,
      importedStatementCycles,
    });

    setCommitting(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    if (result.skippedRows.length > 0) {
      setCommitSkippedRows(result.skippedRows);
    }

    const skippedMessage = buildImportSkippedRowsMessage(result.skippedRows);

    if (result.committedRows === 0) {
      toast.info(
        skippedMessage ||
          "Nenhuma linha nova foi importada. Todas as linhas elegíveis já existiam no histórico.",
      );
      setHistoryRefreshKey((current) => current + 1);
      return;
    }

    const reconcileNote =
      result.reconciledInvoicePayments > 0
        ? ` ${result.reconciledInvoicePayments} pagamento(s) conciliado(s) com lançamento(s) manual(is).`
        : "";

    const skippedNote = skippedMessage ? ` ${skippedMessage}` : "";

    toast.success(
      `${result.createdTransactions} lançamento(s) criado(s) a partir de ${result.committedRows} linha(s).${skippedNote}${reconcileNote}`,
    );
    setHistoryRefreshKey((current) => current + 1);

    if (result.batchId) {
      router.push(`/importacoes/${result.batchId}`);
    }
  }

  function handleReset() {
    setFileName(null);
    setCsvContent(null);
    setContentHash(null);
    setFileConfirmed(false);
    setCardAccountId("");
    setCheckingAccountId("");
    setStatementClosingDate("");
    setStatementDueDate("");
    setConfirmLowConfidenceClosing(false);
    setImportedStatementCycles([]);
    setPreview(null);
    setCategoryRows([]);
    setCategoryFeedbackByLine({});
    setHistoryError(null);
    setCommitting(false);
    setCommitSkippedRows([]);
    setShowFullCategoryList(false);
    setPropagationOffer(null);
    setInvoiceSourceAccounts({});
    setInvoicePaymentModes({});
    setInvoicePaymentCycleTargets({});
    setInvoiceReconcileDecisions({});
    setManualInvoiceCandidates([]);
    setCardSettlementTransactions([]);
    setRowFilter("all");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function renderInvoicePaymentPanel(row: ImportPreviewRow) {
    return (
      <InvoicePaymentImportPanel
        row={row}
        cardName={
          selectedCardAccount
            ? formatAccountSelectLabel(selectedCardAccount)
            : "Cartão selecionado"
        }
        resolution={resolveImportedInvoicePaymentForAccount({
          paymentDate: row.date,
          cardAccount: selectedCardAccount,
          context: invoicePaymentCycleResolveContext,
        })}
        cycleTargetOptions={
          invoicePaymentCycleContext[row.sourceLine]?.options ?? []
        }
        dueDateOptions={
          invoicePaymentCycleContext[row.sourceLine]?.dueDateOptions ?? []
        }
        cycleTargetSelection={
          invoicePaymentCycleContext[row.sourceLine]?.selection ?? {
            target: "previous",
          }
        }
        amountRecommendation={
          invoicePaymentCycleContext[row.sourceLine]?.amountRecommendation ?? {
            kind: "none",
            matches: [],
            message: null,
          }
        }
        futureCycleOptions={
          invoicePaymentCycleContext[row.sourceLine]?.futureOptions ?? []
        }
        onCycleTargetSelectionChange={(selection) =>
          setInvoicePaymentCycleTargets((current) => ({
            ...current,
            [row.sourceLine]: selection,
          }))
        }
        billingConfig={cardBillingConfig}
        cardAccountId={cardAccountId}
        settlementTransactions={invoicePaymentSettlementTransactions}
        cycleContext={invoicePaymentCycleResolveContext}
        mode={getInvoicePaymentImportMode(invoicePaymentModes, row.sourceLine)}
        sourceAccountId={invoiceSourceAccounts[row.sourceLine] ?? ""}
        checkingAccounts={checkingAccounts}
        onModeChange={(mode) =>
          setInvoicePaymentModes((current) => ({
            ...current,
            [row.sourceLine]: mode,
          }))
        }
        onSourceAccountChange={(accountId) =>
          setInvoiceSourceAccounts((current) => ({
            ...current,
            [row.sourceLine]: accountId,
          }))
        }
        reconcileSuggestion={
          invoiceReconcileSuggestions[row.sourceLine] ?? null
        }
        reconcileDecision={getInvoicePaymentReconcileDecision(
          invoiceReconcileDecisions,
          row.sourceLine,
        )}
        onReconcileDecisionChange={(decision) =>
          setInvoiceReconcileDecisions((current) => ({
            ...current,
            [row.sourceLine]: decision,
          }))
        }
      />
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="space-y-3">
        <Link
          href={
            guidedReimport.fromBatchId
              ? IMPORTACOES_ROUTES.detail(guidedReimport.fromBatchId)
              : IMPORTACOES_ROUTES.list
          }
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 gap-1.5 text-muted-foreground",
          )}
        >
          <ArrowLeft className="size-4" />
          {guidedReimport.fromBatchId ? "Voltar à importação" : "Importações"}
        </Link>
        <PageIntro
          description={
            isGuidedReimport
              ? getGuidedReimportIntro({
                  source: guidedReimport.source,
                  accountName: guidedAccountName,
                })
              : getImportReviewPageIntro()
          }
        />
      </div>

      {!fileConfirmed ? (
        <div
          className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
          data-testid="supported-import-banks"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Importe de um destes bancos</p>
              <p className="text-xs text-muted-foreground">
                CSV do extrato — revise antes de gravar.
              </p>
            </div>
            {formatPlannedImportBanksSummary() ? (
              <p className="text-xs text-muted-foreground sm:text-right">
                Em breve: {formatPlannedImportBanksSummary()}
              </p>
            ) : null}
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {getSupportedImportBankSummaries().map((bank) => (
              <li
                key={bank.id}
                className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-background/80 px-2.5 py-1.5"
                data-testid={`supported-import-bank-${bank.id}`}
              >
                <AccountIdentityMark account={{ name: bank.name }} size="xs" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-none">
                    {bank.name}
                  </span>
                  <span className="mt-1 block text-[11px] leading-tight text-muted-foreground">
                    {bank.layouts
                      .map((layout) =>
                        layout
                          .replace(/^Extrato de /i, "")
                          .replace(/^extrato de /i, ""),
                      )
                      .join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isGuidedReimport ? (
        <Alert
          className="border-primary/20 bg-primary/5"
          data-testid="guided-reimport-banner"
        >
          <History className="size-4" />
          <AlertTitle>Importar novamente</AlertTitle>
          <AlertDescription>
            Conta e origem foram pré-selecionadas a partir da importação
            anterior. Selecione o arquivo CSV para revisar — nada será gravado
            automaticamente.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="max-md:px-4 max-md:py-2.5">
          <CardTitle className="text-base max-md:text-sm">Arquivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-md:space-y-2.5 max-md:pt-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between max-md:gap-2">
            <div className="flex items-center gap-3 max-md:gap-2">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 max-md:size-8 max-md:rounded-lg">
                <FileSpreadsheet className="size-5 max-md:size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium max-md:truncate">
                  {fileName ?? "Nenhum arquivo selecionado"}
                </p>
                <p className="text-xs text-muted-foreground max-md:hidden">
                  {getImportFileSelectHint()}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={readingFile}
              >
                {readingFile ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Selecionar CSV
              </Button>
              {csvContent ? (
                <Button type="button" variant="ghost" onClick={handleReset}>
                  Limpar
                </Button>
              ) : null}
            </div>
          </div>

          {fileConfirmation && !fileConfirmed ? (
            <div
              className="space-y-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3"
              data-testid="import-file-confirmation"
              data-source={fileConfirmation.source}
            >
              <div className="flex items-start gap-3">
                <AccountIdentityMark
                  account={{ name: fileConfirmation.institutionName }}
                  size="md"
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">
                    {fileConfirmation.headline}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Confirme se o arquivo parece correto antes de revisar os
                    lançamentos.
                  </p>
                </div>
              </div>

              <dl className="grid gap-2 sm:grid-cols-3">
                {fileConfirmation.signals.map((signal) => (
                  <div
                    key={signal.label}
                    className="rounded-lg bg-background/70 px-2.5 py-2 ring-1 ring-border/50"
                  >
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {signal.label}
                    </dt>
                    <dd className="mt-0.5 text-sm text-foreground">
                      {signal.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => setFileConfirmed(true)}
                  data-testid="confirm-import-file"
                >
                  Continuar para revisão
                </Button>
                <Button type="button" variant="ghost" onClick={handleReset}>
                  Escolher outro arquivo
                </Button>
              </div>
            </div>
          ) : null}

          {fileConfirmation && fileConfirmed ? (
            <div
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3 max-md:gap-2 max-md:rounded-lg max-md:px-2.5 max-md:py-2"
              data-testid="identified-import-bank"
              data-institution={
                identifiedFile?.status === "supported"
                  ? identifiedFile.institutionId
                  : undefined
              }
              data-source={fileConfirmation.source}
            >
              <AccountIdentityMark
                account={{ name: fileConfirmation.institutionName }}
                size="sm"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium max-md:text-xs max-md:leading-snug">
                  {fileConfirmation.headline}
                </p>
                <p className="text-xs text-muted-foreground max-md:mt-0.5 max-md:truncate max-md:text-[11px]">
                  Arquivo confirmado ·{" "}
                  {fileConfirmation.signals
                    .map((signal) => signal.value)
                    .slice(0, 2)
                    .join(" · ")}
                </p>
              </div>
            </div>
          ) : null}

          {fileConfirmed && requiresCardAccount ? (
            <div className="space-y-3 max-md:space-y-2">
              <div className="space-y-1 max-md:space-y-0">
                <p className="text-sm font-medium max-md:text-xs">
                  Contexto deste extrato
                </p>
                <p className="text-xs text-muted-foreground max-md:hidden">
                  Usamos as datas do arquivo para encaixar este extrato na
                  fatura certa — não o dia fixo do cartão.
                </p>
              </div>

              {accountsLoading ? (
                <p className="text-xs text-muted-foreground">
                  Carregando cartões…
                </p>
              ) : creditCardAccounts.length === 0 ? (
                <Alert
                  data-testid="import-no-credit-card-account"
                  className="border-amber-500/25 bg-amber-500/5"
                >
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Cadastre um cartão de crédito</AlertTitle>
                  <AlertDescription>
                    É preciso ter pelo menos uma conta de cartão cadastrada
                    antes de importar este extrato.{" "}
                    <Link
                      href="/contas"
                      className="font-medium text-foreground underline underline-offset-2"
                    >
                      Ir para Contas
                    </Link>
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <FormSelect
                      id="card-account"
                      label="Cartão de destino"
                      value={cardAccountId}
                      onChange={(event) =>
                        setCardAccountId(event.target.value)
                      }
                      disabled={
                        accountsLoading || creditCardAccounts.length === 1
                      }
                      className="max-md:h-9"
                      data-testid="import-destination-card-select"
                    >
                      {creditCardAccounts.length > 1 ? (
                        <option value="">Qual cartão é deste extrato?</option>
                      ) : null}
                      {creditCardAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {formatAccountSelectLabel(account)}
                        </option>
                      ))}
                    </FormSelect>
                    {creditCardAccounts.length === 1 ? (
                      <p
                        className="text-[11px] text-muted-foreground"
                        data-testid="import-destination-card-auto-selected"
                      >
                        Selecionado automaticamente porque é o único cartão
                        cadastrado.
                      </p>
                    ) : null}
                  </div>

                  <div
                    className="grid gap-3 sm:grid-cols-2 max-md:gap-2"
                    data-testid="import-statement-file-cycle"
                  >
                    <FormInput
                      id="statement-due-date"
                      label="Vencimento neste extrato"
                      type="date"
                      value={statementDueDate}
                      onChange={(event) => {
                        setStatementDueDate(event.target.value);
                        setConfirmLowConfidenceClosing(false);
                        setStatementClosingDate("");
                      }}
                      required
                      data-testid="import-statement-due-date"
                      className="max-md:h-9"
                    />
                    <FormInput
                      id="statement-closing-date"
                      label="Fechamento neste extrato"
                      type="date"
                      value={statementClosingDate}
                      onChange={(event) => {
                        setStatementClosingDate(event.target.value);
                        setConfirmLowConfidenceClosing(false);
                      }}
                      required={
                        statementClosingInference?.confidence === "none" ||
                        (statementClosingInference?.confidence === "low" &&
                          !confirmLowConfidenceClosing &&
                          !statementClosingDate)
                      }
                      data-testid="import-statement-closing-date"
                      className="max-md:h-9"
                    />
                  </div>

                  {statementClosingInference?.confidence === "low" &&
                  !confirmLowConfidenceClosing &&
                  !statementClosingDate ? (
                    <Alert
                      className="border-amber-500/25 bg-amber-500/5"
                      data-testid="import-statement-closing-low-confidence"
                    >
                      <AlertTriangle className="size-4" />
                      <AlertTitle>Confirme o fechamento sugerido</AlertTitle>
                      <AlertDescription className="space-y-2">
                        <p>
                          Inferimos {statementClosingInference.closingDate} a
                          partir do cartão, mas a confiança é baixa. Confirme
                          antes de aplicar.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setStatementClosingDate(
                              statementClosingInference.closingDate,
                            );
                            setConfirmLowConfidenceClosing(true);
                          }}
                          data-testid="import-confirm-low-confidence-closing"
                        >
                          Usar fechamento sugerido
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {statementClosingInference?.confidence === "high" &&
                  statementClosingDate ? (
                    <p
                      className="text-[11px] text-muted-foreground"
                      data-testid="import-statement-closing-high-confidence"
                    >
                      Fechamento definido automaticamente.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {fileConfirmed && requiresCheckingAccount ? (
            <FormSelect
              id="checking-account"
              label="Conta de destino"
              value={checkingAccountId}
              onChange={(event) => setCheckingAccountId(event.target.value)}
              disabled={accountsLoading}
            >
              <option value="">Qual conta corrente recebe estes lançamentos?</option>
              {checkingAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountSelectLabel(account)}
                </option>
              ))}
            </FormSelect>
          ) : null}

          {fileConfirmed &&
          requiresCheckingAccount &&
          !checkingAccountId &&
          csvContent ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>Escolha a conta de destino</AlertTitle>
              <AlertDescription>
                Precisamos da conta corrente para comparar com importações
                anteriores.
              </AlertDescription>
            </Alert>
          ) : null}
          {fileConfirmed &&
          requiresCardAccount &&
          creditCardAccounts.length > 1 &&
          !cardAccountId &&
          csvContent ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>Escolha o cartão para montar a prévia</AlertTitle>
              <AlertDescription>
                Sem o cartão, não dá para gerar fingerprints e encaixar a fatura
                corretamente.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {historyLoading ? (
        <Alert>
          <History className="size-4" />
          <AlertTitle>Comparando com histórico</AlertTitle>
          <AlertDescription>
            Consultando importações anteriores desta conta...
          </AlertDescription>
        </Alert>
      ) : null}

      {historyError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Histórico indisponível</AlertTitle>
          <AlertDescription>{historyError}</AlertDescription>
        </Alert>
      ) : null}

      {preview?.historicalSummary?.fileAlreadyImported ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Arquivo já importado</AlertTitle>
          <AlertDescription>
            Este arquivo parece já ter sido importado anteriormente para esta conta.
            {activePreview?.historicalSummary?.matchingBatches[0]?.importedAt ? (
              <span className="mt-1 block text-xs">
                Última importação:{" "}
                {formatDate(activePreview.historicalSummary.matchingBatches[0].importedAt)}
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {commitSkippedRows.length > 0 ? (
        <Alert>
          <History className="size-4" />
          <AlertTitle>Linhas ignoradas na importação</AlertTitle>
          <AlertDescription>
            {buildImportSkippedRowsMessage(commitSkippedRows)}
            <span className="mt-1 block text-xs text-muted-foreground">
              Linhas: {formatCommitSkippedSourceLines(commitSkippedRows, 12)}
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {categoriesLoading ? (
        <Alert>
          <Loader2 className="size-4 animate-spin" />
          <AlertTitle>Buscando sugestões de categoria</AlertTitle>
          <AlertDescription>
            Comparando descrições com o histórico de lançamentos categorizados...
          </AlertDescription>
        </Alert>
      ) : null}

      {activePreview ? (
        <>
          <div className="space-y-3 pb-16 md:space-y-4 md:pb-0">
          <ImportReviewMobileSection
            id="context"
            title="Contexto do arquivo"
            summary={`${activePreview.summary.totalRows} lançamento${
              activePreview.summary.totalRows === 1 ? "" : "s"
            }${
              invoicePaymentRows.length > 0
                ? ` · ${invoicePaymentRows.length} pagamento${
                    invoicePaymentRows.length === 1 ? "" : "s"
                  }`
                : ""
            }`}
            open={mobileOpenSection === "context"}
            onOpenChange={(open) =>
              setExclusiveMobileSection("context", open)
            }
            className="md:border-0 md:bg-transparent md:shadow-none"
            contentClassName="space-y-2 px-3 pb-3 md:space-y-3 md:p-0"
          >
          <ImportReviewNarrativeHeader
            cardName={
              selectedCardAccount
                ? formatAccountSelectLabel(selectedCardAccount)
                : null
            }
            financialSummary={importFinancialSummary}
            preview={activePreview}
            sourceLabel={
              activePreview.source
                ? importSourceLabels[activePreview.source]
                : "Não reconhecida"
            }
            contextHeadline={reviewContext?.headline ?? null}
          />

          {reviewDiagnosis && reviewDiagnosis.attentionItems.length > 0 ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
              <p className="text-xs font-medium text-foreground">
                {reviewDiagnosis.headline}
              </p>
              <ul className="mt-1 space-y-0.5">
                {reviewDiagnosis.attentionItems.map((item) => (
                  <li
                    key={item.id}
                    className="text-xs text-amber-900 dark:text-amber-100/90"
                  >
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          </ImportReviewMobileSection>

          {(activePreview.parseErrors.length > 0 || activePreview.warnings.length > 0) && (
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Alertas e erros</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activePreview.parseErrors.map((error) => (
                  <Alert key={`parse-${error.sourceLine}-${error.message}`} variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertTitle>
                      Erro na linha {error.sourceLine}
                    </AlertTitle>
                    <AlertDescription>{error.message}</AlertDescription>
                  </Alert>
                ))}

                {activePreview.warnings.map((warning, index) => (
                  <Alert
                    key={`${warning.code}-${warning.sourceLine ?? warning.externalId ?? index}`}
                  >
                    <AlertTriangle className="size-4" />
                    <AlertTitle>
                      {warning.code === "reversal_pair"
                        ? "Par de estorno"
                        : warning.code === "parse_error"
                          ? "Erro de parse"
                          : warning.code === "missing_account"
                            ? "Conta ausente"
                            : warning.code === "unsupported_source"
                              ? "Arquivo não suportado"
                              : warning.code === "file_already_imported"
                                ? "Arquivo já importado"
                                : warning.code === "historical_duplicate_rows"
                                  ? "Linhas já importadas"
                                  : warning.code === "historical_conflict_rows"
                                    ? "Conflito histórico"
                                    : "Aviso"}
                    </AlertTitle>
                    <AlertDescription>
                      {warning.message}
                      {warning.relatedSourceLines?.length ? (
                        <span className="mt-1 block text-xs">
                          Linhas: {warning.relatedSourceLines.join(", ")}
                        </span>
                      ) : null}
                    </AlertDescription>
                  </Alert>
                ))}
              </CardContent>
            </Card>
          )}

          {invoicePaymentRows.length > 0 ? (
            <ImportReviewMobileSection
              id="payment"
              title="Pagamento de fatura"
              summary={`${invoicePaymentRows.length} pagamento${
                invoicePaymentRows.length === 1 ? "" : "s"
              } · origem e fatura`}
              open={mobileOpenSection === "payment"}
              onOpenChange={(open) =>
                setExclusiveMobileSection("payment", open)
              }
              data-testid="import-invoice-payment-review-section"
              className="border-border/50"
              desktopHeader={
                <div className="gap-0.5 px-6 py-2.5">
                  <p className="text-sm font-semibold">Pagamentos detectados</p>
                  <p className="text-xs text-muted-foreground">
                    Origem e fatura.
                  </p>
                </div>
              }
              contentClassName="space-y-2.5 px-3 pb-3 md:px-6 md:pb-6"
            >
                {invoicePaymentRows.map((row) => (
                  <div
                    key={`invoice-payment-review-${row.sourceLine}`}
                    className="rounded-lg border border-border/40 bg-muted/5 px-3 py-2.5"
                  >
                    {renderInvoicePaymentPanel(row)}
                  </div>
                ))}
            </ImportReviewMobileSection>
          ) : null}

          <Card
            className="hidden border-primary/20 bg-primary/[0.03] shadow-sm md:block"
            data-testid="import-commit-summary"
          >
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Resumo da importação
                </p>
                <p className="text-xs text-muted-foreground">
                  {committableRows.length > 0
                    ? `Ao aplicar, serão criados ${committableRows.length} lançamento${
                        committableRows.length === 1 ? "" : "s"
                      } novo${committableRows.length === 1 ? "" : "s"}${
                        invoicePaymentRows.length > 0
                          ? ` · ${invoicePaymentRows.length} pagamento${
                              invoicePaymentRows.length === 1 ? "" : "s"
                            } de fatura`
                          : ""
                      }.`
                    : "Nenhuma linha nova e pronta para importar."}
                </p>
                {(activePreview.categorySummary?.withoutCategoryCount ?? 0) >
                0 ? (
                  <p
                    className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200"
                    data-testid="import-commit-category-attention"
                    role="status"
                  >
                    <AlertTriangle
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden
                    />
                    <span>
                      Você pode continuar agora, mas ainda há{" "}
                      {activePreview.categorySummary!.withoutCategoryCount}{" "}
                      lançamento
                      {activePreview.categorySummary!.withoutCategoryCount === 1
                        ? ""
                        : "s"}{" "}
                      sem categoria.
                    </span>
                  </p>
                ) : null}
                {historyLoading ? (
                  <p
                    className="text-xs text-muted-foreground"
                    data-testid="import-commit-history-loading"
                  >
                    Verificando histórico de importações…
                  </p>
                ) : null}
                {commitValidationError ? (
                  <p
                    className="text-xs text-amber-800 dark:text-amber-200"
                    data-testid="import-commit-validation-error"
                    role="status"
                  >
                    {commitValidationError}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                size="lg"
                className="shrink-0"
                disabled={
                  committing ||
                  historyLoading ||
                  committableRows.length === 0 ||
                  Boolean(commitValidationError)
                }
                onClick={() => void handleCommit()}
                data-testid="import-commit-button"
                title={
                  commitValidationError
                    ? commitValidationError
                    : historyLoading
                      ? "Aguardando verificação do histórico"
                      : undefined
                }
              >
                {committing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  `Aplicar importação · ${committableRows.length}`
                )}
              </Button>
            </CardContent>
          </Card>
          {activePreview.categorySummary && user ? (
            <ImportReviewMobileSection
              id="categories"
              title="Revisão de categorias"
              summary={
                activePreview.categorySummary.withoutCategoryCount > 0
                  ? `${activePreview.categorySummary.withoutCategoryCount} lançamento${
                      activePreview.categorySummary.withoutCategoryCount === 1
                        ? ""
                        : "s"
                    } ainda sem categoria`
                  : `${activePreview.categorySummary.confirmedCount} confirmadas · ${activePreview.categorySummary.suggestedCount} sugeridas`
              }
              attention={
                activePreview.categorySummary.withoutCategoryCount > 0
              }
              open={mobileOpenSection === "categories"}
              onOpenChange={(open) =>
                setExclusiveMobileSection("categories", open)
              }
              className="border-border/40 md:border-0 md:bg-transparent md:shadow-none"
              contentClassName=""
            >
            <ImportCategoryReviewPanel
              rows={activePreview.rows}
              categories={categories}
              categoryCatalog={categoryCatalog}
              categoryFeedbackByLine={categoryFeedbackByLine}
              userId={user.id}
              loading={categoriesLoading}
              mode={categoryReviewMode}
              onModeChange={setCategoryReviewMode}
              onRowsChange={handleCategoryRowsChange}
              onCategoryChange={handleRowCategoryChange}
              onCategorySaved={handleImportCategorySaved}
              onConfirmSuggestion={handleConfirmSuggestion}
              showFullList={showFullCategoryList}
              onShowFullListChange={setShowFullCategoryList}
              propagationOffer={propagationOffer}
              onAcceptPropagation={handleAcceptCategoryPropagation}
              onDismissPropagation={() => setPropagationOffer(null)}
              embedded
            />
            </ImportReviewMobileSection>
          ) : null}

          <ImportReviewMobileSection
            id="other"
            title="Outros lançamentos"
            summary="Compras e demais linhas do arquivo"
            open={mobileOpenSection === "other"}
            onOpenChange={(open) => setExclusiveMobileSection("other", open)}
            data-testid="import-other-rows-section"
            className="border-border/50"
            desktopHeader={
              <div className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">Outros lançamentos</p>
                  <p className="text-xs text-muted-foreground">
                    Compras e demais linhas do arquivo.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="hidden md:inline-flex"
                  onClick={() => setShowOtherRows((current) => !current)}
                  data-testid="toggle-other-import-rows"
                >
                  {showOtherRows ? "Ocultar lista" : "Mostrar lista"}
                </Button>
              </div>
            }
            contentClassName="px-3 pb-3 md:px-6 md:pb-6"
          >
            {showOtherRows ? (
              <div className="space-y-4">
                {duplicateAttention ? (
                  <ImportDuplicateAttentionCard attention={duplicateAttention} />
                ) : null}

                {activePreview.needsReview.filter(
                  (row) => row.kind !== "card_invoice_payment",
                ).length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Precisam revisão</p>
                    {activePreview.needsReview
                      .filter((row) => row.kind !== "card_invoice_payment")
                      .map((row) => {
                        const duplicateReason = getImportRowDuplicateReason(
                          row,
                          activePreview.possibleDuplicates,
                        );

                        return (
                          <div
                            key={`needs-review-${row.sourceLine}`}
                            className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">
                                  Linha {row.sourceLine} — {row.description}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(row.date)} ·{" "}
                                  {formatCurrency(row.amount)} ·{" "}
                                  {importKindLabels[row.kind]}
                                </p>
                                {duplicateReason ? (
                                  <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
                                    Motivo: {duplicateReason}
                                  </p>
                                ) : null}
                              </div>
                              <ImportRowBadges
                                row={row}
                                isDuplicate={duplicateSourceLines.has(
                                  row.sourceLine,
                                )}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {filterOptions.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={rowFilter === option.value ? "default" : "outline"}
                      onClick={() => setRowFilter(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>

                {filteredRows.filter(
                  (row) => row.kind !== "card_invoice_payment",
                ).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum outro lançamento neste filtro.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredRows
                      .filter((row) => row.kind !== "card_invoice_payment")
                      .map((row) => {
                        const isDuplicate = duplicateSourceLines.has(
                          row.sourceLine,
                        );
                        const isInvoicePayment =
                          row.kind === "card_invoice_payment";
                        const selectedCategoryId = getImportRowSelectedCategoryId(
                          row,
                        );
                        const rowCategoryFeedback =
                          categoryFeedbackByLine[row.sourceLine] ?? null;
                        const highlightCategoryLabel =
                          isImportCategoryFeedbackActive(
                            rowCategoryFeedback,
                            selectedCategoryId,
                          );

                        return (
                          <div
                            key={`row-${row.sourceLine}-${row.externalFingerprint}`}
                            className="rounded-xl border border-border/50 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <p className="text-sm font-medium">
                                  L{row.sourceLine} — {row.description}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(row.date)} ·{" "}
                                  {importKindLabels[row.kind]}
                                </p>
                                <ImportRowBadges
                                  row={row}
                                  isDuplicate={isDuplicate}
                                />
                                {row.categorySuggestion ? (
                                  <div
                                    className={cn(
                                      "flex flex-wrap items-center gap-2 text-xs text-muted-foreground",
                                      highlightCategoryLabel &&
                                        "rounded-md bg-emerald-500/10 px-2 py-1 text-foreground",
                                    )}
                                    data-testid={`import-row-category-suggestion-${row.sourceLine}`}
                                    data-category-feedback={
                                      highlightCategoryLabel
                                        ? rowCategoryFeedback?.kind ?? "none"
                                        : "none"
                                    }
                                  >
                                    <span>
                                      Sugestão:{" "}
                                      <span className="font-medium text-foreground">
                                        {row.categorySuggestion.categoryName}
                                      </span>
                                    </span>
                                    <CategorySuggestionOriginChip
                                      suggestion={row.categorySuggestion}
                                      showConfidence
                                    />
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <CategorySuggestionOriginChip
                                      suggestion={null}
                                    />
                                  </div>
                                )}
                              </div>

                              <div className="text-right">
                                <p className="text-base font-semibold tabular-nums">
                                  {row.direction === "out" ? "-" : "+"}
                                  {formatCurrency(row.amount)}
                                </p>
                              </div>
                            </div>

                            {showFullCategoryList &&
                            row.historicalStatus === "new" &&
                            !isInvoicePayment &&
                            row.reviewStatus !== "invalid" &&
                            row.reviewStatus !== "already_imported" &&
                            user ? (
                              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                                <ImportRowCategoryField
                                  sourceLine={row.sourceLine}
                                  transactionType={resolveImportRowTransactionType(
                                    row,
                                  )}
                                  categories={categories}
                                  selectedCategoryId={selectedCategoryId}
                                  categoryFeedback={rowCategoryFeedback}
                                  onCategoryChange={(categoryId) =>
                                    handleRowCategoryChange(
                                      row.sourceLine,
                                      categoryId,
                                    )
                                  }
                                  onCategorySaved={handleImportCategorySaved}
                                  userId={user.id}
                                />
                                {row.categoryStatus === "suggested" &&
                                row.categorySuggestion ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleConfirmSuggestion(row.sourceLine)
                                    }
                                  >
                                    Confirmar sugestão
                                  </Button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            ) : (
              <p className="hidden text-sm text-muted-foreground md:block">
                Lista oculta para focar nos pagamentos. Mostre quando quiser
                revisar compras e categorias linha a linha.
              </p>
            )}
          </ImportReviewMobileSection>

          <ImportReviewMobileCommitBar
            summary={formatImportMobileCommitSummary({
              totalRows: activePreview.summary.totalRows,
              paymentCount: invoicePaymentRows.length,
            })}
            commitLabel={`Aplicar importação · ${committableRows.length}`}
            disabled={
              committing ||
              historyLoading ||
              committableRows.length === 0 ||
              Boolean(commitValidationError)
            }
            committing={committing}
            historyLoading={historyLoading}
            validationError={commitValidationError}
            categoryAttentionMessage={
              (activePreview.categorySummary?.withoutCategoryCount ?? 0) > 0
                ? "Você pode continuar agora, mas ainda há lançamentos sem categoria"
                : null
            }
            onCommit={() => void handleCommit()}
          />
          </div>

        </>
      ) : csvContent && identifiedFile?.status === "unsupported" ? (
        <Alert
          className="border-amber-500/25 bg-amber-500/5"
          data-testid="unsupported-import-file"
        >
          <AlertCircle className="size-4 text-amber-700 dark:text-amber-300" />
          <AlertTitle>{identifiedFile.headline}</AlertTitle>
          <AlertDescription>
            <span className="block">{identifiedFile.message}</span>
            <span className="mt-2 block text-muted-foreground">
              {identifiedFile.tip}
            </span>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
