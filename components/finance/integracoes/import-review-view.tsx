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
import { FormSelect } from "@/components/forms/form-controls";
import { PageIntro } from "@/components/layout/page-intro";
import { useConfirm } from "@/components/feedback/confirm-dialog-provider";
import { AccountIdentityMark } from "@/components/finance/account-identity";
import { InvoicePaymentImportPanel } from "@/components/finance/integracoes/invoice-payment-import-panel";
import { useAppContext } from "@/contexts/app-context";
import { buildImportPreview } from "@/lib/integrations/core/import-orchestrator";
import {
  identifyImportFile,
} from "@/lib/integrations/core/identify-import-file";
import { buildImportFileConfirmation } from "@/lib/integrations/core/import-file-confirmation";
import {
  formatPlannedImportBanksSummary,
  formatSupportedImportBanksSummary,
  getImportFileSelectHint,
  getImportLayoutBySource,
  getImportReviewPageIntro,
  getSupportedImportFileTip,
} from "@/lib/integrations/catalog/import-integrations";
import { getImportSourceProvider } from "@/lib/integrations/providers/registry";
import {
  commitImportPreview,
  getCommitImportPreviewValidationError,
} from "@/lib/integrations/commit/commit-import-preview";
import { getCommittableImportRows } from "@/lib/integrations/commit/map-import-row";
import {
  buildImportDuplicateAttention,
  getImportRowDuplicateReason,
} from "@/lib/integrations/core/import-duplicate-attention";
import { buildImportReviewDiagnosis } from "@/lib/integrations/core/import-review-diagnosis";
import { buildImportReviewContext } from "@/lib/integrations/core/import-review-context";
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
import { addDaysIso } from "@/lib/finance/credit-card-billing";
import { formatAccountSelectLabel } from "@/lib/finance/account-identity";
import {
  applyConfirmedCategoryToRow,
  applyHighConfidenceCategorySuggestions,
  enrichPreviewWithCategorySuggestions,
  fetchCategoryHistoryTransactions,
  mapCategoriesToSuggestionCatalog,
  resolveImportCategoryStatusLabel,
  withCategorySummary,
} from "@/lib/integrations/categories/category-suggestion-service";
import { resolveImportRowTransactionType } from "@/lib/integrations/categories/category-suggester";
import {
  fetchHiddenSystemCategoryIds,
  filterActiveCategories,
} from "@/lib/finance/active-categories";
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

const categorySourceLabels: Record<
  NonNullable<ImportPreviewRow["categorySuggestion"]>["source"],
  string
> = {
  exact_match: "Match exato",
  normalized_merchant: "Merchant normalizado",
  historical_frequency: "Frequência histórica",
};

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
        <span className="ml-1 text-[10px] uppercase">
          {row.categorySuggestion.confidence}
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
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryRows, setCategoryRows] = useState<ImportPreviewRow[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [invoiceSourceAccounts, setInvoiceSourceAccounts] = useState<
    Record<number, string>
  >({});
  const [invoicePaymentModes, setInvoicePaymentModes] = useState<
    Record<number, InvoicePaymentImportMode>
  >({});
  const [invoiceReconcileDecisions, setInvoiceReconcileDecisions] = useState<
    Record<number, InvoicePaymentReconcileDecision>
  >({});
  const [manualInvoiceCandidates, setManualInvoiceCandidates] = useState<
    ManualInvoicePaymentCandidate[]
  >([]);
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [readingFile, setReadingFile] = useState(false);
  const [fileConfirmed, setFileConfirmed] = useState(false);

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
    () => mapCategoriesToSuggestionCatalog(categories),
    [categories],
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

  const highConfidencePendingCount = useMemo(() => {
    if (!activePreview) {
      return 0;
    }

    return activePreview.rows.filter(
      (row) =>
        row.categoryStatus === "suggested" &&
        row.categorySuggestion?.confidence === "high",
    ).length;
  }, [activePreview]);

  const selectedCardAccount = useMemo(
    () => creditCardAccounts.find((account) => account.id === cardAccountId) ?? null,
    [cardAccountId, creditCardAccounts],
  );

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
            cycleId: resolution?.cycleId ?? null,
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
    detectedSource,
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

    const invoicePeriodLabels = activePreview.rows
      .filter((row) => row.kind === "card_invoice_payment")
      .map(
        (row) =>
          resolveImportedInvoicePaymentForAccount({
            paymentDate: row.date,
            cardAccount: selectedCardAccount,
          })?.periodLabel,
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
    });
  }, [
    activeFamily?.id,
    activePreview,
    contentHash,
    fileName,
    invoicePaymentModes,
    invoiceSourceAccounts,
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

  const guidedAccountName = useMemo(() => {
    if (!guidedReimport.accountId) return null;
    return (
      accounts.find((account) => account.id === guidedReimport.accountId)?.name ??
      null
    );
  }, [accounts, guidedReimport.accountId]);

  const isGuidedReimport = Boolean(guidedReimport.fromBatchId);

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
        const history = await fetchCategoryHistoryTransactions(supabase, accountIds);
        const catalog = mapCategoriesToSuggestionCatalog(loadedCategories);
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

  function handleApplyHighConfidenceCategories() {
    setCategoryRows((current) =>
      applyHighConfidenceCategorySuggestions(
        current.length > 0 ? current : (preview?.rows ?? []),
        categoryCatalog,
      ),
    );
  }

  function handleRowCategoryChange(sourceLine: number, categoryId: string) {
    setCategoryRows((current) => {
      const baseRows = current.length > 0 ? current : (preview?.rows ?? []);
      return baseRows.map((row) =>
        row.sourceLine === sourceLine
          ? applyConfirmedCategoryToRow(row, categoryId || null, categoryCatalog)
          : row,
      );
    });
  }

  function handleConfirmSuggestion(sourceLine: number) {
    setCategoryRows((current) => {
      const baseRows = current.length > 0 ? current : (preview?.rows ?? []);
      return baseRows.map((row) => {
        if (row.sourceLine !== sourceLine || !row.categorySuggestion) {
          return row;
        }

        return applyConfirmedCategoryToRow(
          row,
          row.categorySuggestion.categoryId,
          categoryCatalog,
        );
      });
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setReadingFile(true);
    setFileName(file.name);
    setFileConfirmed(false);
    setPreview(null);
    setInvoiceSourceAccounts({});
    setInvoicePaymentModes({});
    setInvoiceReconcileDecisions({});
    setManualInvoiceCandidates([]);
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

    const targetAccount =
      accounts.find((account) => account.id === targetAccountId) ?? null;

    const result = await commitImportPreview(supabase, {
      preview: activePreview,
      targetAccountId,
      invoiceSourceAccounts,
      invoicePaymentModes,
      invoicePaymentReconcileDecisions: invoiceReconcileDecisions,
      invoicePaymentReconcileSuggestions: invoiceReconcileSuggestions,
      ownerUserId: user.id,
      familyId: activeFamily?.id ?? null,
      fileName,
      contentHash,
      targetAccount,
    });

    setCommitting(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    const reconcileNote =
      result.reconciledInvoicePayments > 0
        ? ` ${result.reconciledInvoicePayments} pagamento(s) conciliado(s) com lançamento(s) manual(is).`
        : "";

    toast.success(
      `${result.createdTransactions} lançamento(s) criado(s) a partir de ${result.committedRows} linha(s).${reconcileNote}`,
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
    setPreview(null);
    setCategoryRows([]);
    setHistoryError(null);
    setCommitting(false);
    setInvoiceSourceAccounts({});
    setInvoicePaymentModes({});
    setInvoiceReconcileDecisions({});
    setManualInvoiceCandidates([]);
    setRowFilter("all");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6 md:space-y-8">
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

      <Alert
        className="border-border/60 bg-muted/30"
        data-testid="supported-import-banks"
      >
        <FileSpreadsheet className="size-4" />
        <AlertTitle>Bancos suportados hoje</AlertTitle>
        <AlertDescription>
          <span className="block">{formatSupportedImportBanksSummary()}</span>
          <span className="mt-1 block text-muted-foreground">
            {getSupportedImportFileTip()}
          </span>
          {formatPlannedImportBanksSummary() ? (
            <span className="mt-2 block text-xs text-muted-foreground">
              Em breve: {formatPlannedImportBanksSummary()}
            </span>
          ) : null}
        </AlertDescription>
      </Alert>

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
        <CardHeader>
          <CardTitle className="text-base">Arquivo importado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <FileSpreadsheet className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {fileName ?? "Nenhum arquivo selecionado"}
                </p>
                <p className="text-xs text-muted-foreground">
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
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3"
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
                size="md"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {fileConfirmation.headline}
                </p>
                <p className="text-xs text-muted-foreground">
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
            <FormSelect
              id="card-account"
              label="Conta de cartão (obrigatória para o preview)"
              value={cardAccountId}
              onChange={(event) => setCardAccountId(event.target.value)}
              disabled={accountsLoading}
            >
              <option value="">Selecione o cartão de destino</option>
              {creditCardAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountSelectLabel(account)}
                </option>
              ))}
            </FormSelect>
          ) : null}

          {fileConfirmed && requiresCheckingAccount ? (
            <FormSelect
              id="checking-account"
              label="Conta de destino (obrigatória para comparação histórica)"
              value={checkingAccountId}
              onChange={(event) => setCheckingAccountId(event.target.value)}
              disabled={accountsLoading}
            >
              <option value="">Selecione a conta corrente de destino</option>
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
              <AlertTitle>Conta de destino pendente</AlertTitle>
              <AlertDescription>
                Selecione a conta corrente para comparar o preview com importações
                anteriores desta conta.
              </AlertDescription>
            </Alert>
          ) : null}
          {fileConfirmed &&
          requiresCardAccount &&
          !cardAccountId &&
          csvContent ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>Conta de cartão pendente</AlertTitle>
              <AlertDescription>
                Selecione o cartão de crédito para gerar o preview com fingerprints
                corretas.
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
          {reviewContext ? (
            <ImportReviewContextLine context={reviewContext} />
          ) : null}

          {reviewDiagnosis ? (
            <ImportReviewDiagnosisCard diagnosis={reviewDiagnosis} />
          ) : null}

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

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              label="Fonte detectada"
              value={
                activePreview.source
                  ? importSourceLabels[activePreview.source]
                  : "Não reconhecida"
              }
            />
            <SummaryCard label="Total de linhas" value={activePreview.summary.totalRows} />
            <SummaryCard
              label="Novas / já importadas"
              value={`${activePreview.summary.historicalNewRowCount} / ${activePreview.summary.historicalAlreadyImportedRowCount}`}
              hint={
                activePreview.historicalSummary?.partialOverlap
                  ? "Sobreposição parcial com histórico"
                  : undefined
              }
            />
            <SummaryCard
              label="Válidas / inválidas"
              value={`${activePreview.summary.validRows} / ${activePreview.summary.invalidRows}`}
            />
            <SummaryCard
              label="Precisam revisão"
              value={activePreview.needsReview.length}
              hint={`${activePreview.summary.duplicateGroupCount} grupo(s) intra-arquivo`}
            />
          </div>

          {activePreview.categorySummary ? (
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Sugestões de categoria</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Baseadas no histórico de lançamentos já categorizados. Nada é
                    aplicado automaticamente no commit.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={highConfidencePendingCount === 0 || categoriesLoading}
                  onClick={handleApplyHighConfidenceCategories}
                >
                  Confirmar {highConfidencePendingCount} sugestão(ões) de alta confiança
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard
                    label="Sugeridas"
                    value={activePreview.categorySummary.suggestedCount}
                  />
                  <SummaryCard
                    label="Alta confiança"
                    value={activePreview.categorySummary.highConfidenceCount}
                  />
                  <SummaryCard
                    label="Confirmadas"
                    value={activePreview.categorySummary.confirmedCount}
                  />
                  <SummaryCard
                    label="Sem categoria"
                    value={activePreview.categorySummary.withoutCategoryCount}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Contagem por tipo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(activePreview.summary.countsByKind).map(([kind, count]) => (
                    <Badge key={kind} variant="outline">
                      {importKindLabels[kind as keyof typeof importKindLabels]}: {count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Contagem por status de revisão</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(activePreview.summary.countsByReviewStatus).map(
                    ([status, count]) => (
                      <Badge
                        key={status}
                        variant="outline"
                        className={
                          reviewStatusBadgeClass[status as ImportReviewStatus]
                        }
                      >
                        {
                          importReviewStatusLabels[
                            status as ImportReviewStatus
                          ]
                        }
                        : {count}
                      </Badge>
                    ),
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Contagem por status histórico</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(activePreview.summary.countsByHistoricalStatus).map(
                    ([status, count]) => (
                      <Badge
                        key={status}
                        variant="outline"
                        className={
                          historicalStatusBadgeClass[
                            status as ImportRowHistoricalStatus
                          ]
                        }
                      >
                        {
                          importHistoricalStatusLabels[
                            status as ImportRowHistoricalStatus
                          ]
                        }
                        : {count}
                      </Badge>
                    ),
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {duplicateAttention ? (
            <ImportDuplicateAttentionCard attention={duplicateAttention} />
          ) : null}

          {activePreview.needsReview.length > 0 ? (
            <Card className="border-amber-500/20 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Linhas que precisam revisão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activePreview.needsReview.map((row) => {
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
                          {formatDate(row.date)} · {formatCurrency(row.amount)} ·{" "}
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
                        isDuplicate={duplicateSourceLines.has(row.sourceLine)}
                      />
                    </div>

                    {row.kind === "card_invoice_payment" ? (
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
                        })}
                        mode={getInvoicePaymentImportMode(
                          invoicePaymentModes,
                          row.sourceLine,
                        )}
                        sourceAccountId={
                          invoiceSourceAccounts[row.sourceLine] ?? ""
                        }
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
                    ) : null}
                  </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Linhas normalizadas</CardTitle>
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
            </CardHeader>
            <CardContent>
              {filteredRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma linha neste filtro.
                </div>
              ) : (
                <div className="divide-y divide-border/60 rounded-xl border border-border/50">
                  {filteredRows.map((row) => {
                    const isDuplicate = duplicateSourceLines.has(row.sourceLine);
                    const isInvoicePayment = row.kind === "card_invoice_payment";

                    return (
                      <div
                        key={`row-${row.sourceLine}-${row.externalFingerprint}`}
                        className={cn(
                          "px-4 py-4",
                          isInvoicePayment && "bg-violet-500/5",
                          isDuplicate && "bg-orange-500/5",
                          row.metadata.reversalPair && "bg-sky-500/5",
                          row.historicalStatus === "already_imported" && "bg-rose-500/5",
                          row.historicalStatus === "possible_historical_conflict" &&
                            "bg-fuchsia-500/5",
                        )}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                L{row.sourceLine}
                              </span>
                              <span className="text-sm font-medium">
                                {row.description}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                              <span>{formatDate(row.date)}</span>
                              <span>{importDirectionLabels[row.direction]}</span>
                              <span>{importKindLabels[row.kind]}</span>
                              {row.metadata.installment ? (
                                <span>Parcela {row.metadata.installment}</span>
                              ) : null}
                            </div>
                            <ImportRowBadges row={row} isDuplicate={isDuplicate} />
                            {row.normalizedMerchant ? (
                              <p className="text-xs text-muted-foreground">
                                Merchant normalizado:{" "}
                                <span className="font-mono">{row.normalizedMerchant}</span>
                              </p>
                            ) : null}
                            {row.categorySuggestion ? (
                              <p className="text-xs text-muted-foreground">
                                Sugestão:{" "}
                                <span className="font-medium text-foreground">
                                  {row.categorySuggestion.categoryName}
                                </span>{" "}
                                · {categorySourceLabels[row.categorySuggestion.source]} ·{" "}
                                {row.categorySuggestion.basedOnCount} ocorrência(s) ·{" "}
                                confiança {row.categorySuggestion.confidence}
                              </p>
                            ) : null}
                          </div>

                          <div className="text-right">
                            <p className="text-base font-semibold tabular-nums">
                              {row.direction === "out" ? "-" : "+"}
                              {formatCurrency(row.amount)}
                            </p>
                          </div>
                        </div>

                        {isInvoicePayment ? (
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
                            })}
                            mode={getInvoicePaymentImportMode(
                              invoicePaymentModes,
                              row.sourceLine,
                            )}
                            sourceAccountId={
                              invoiceSourceAccounts[row.sourceLine] ?? ""
                            }
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
                        ) : null}

                        {row.historicalStatus === "new" &&
                        row.reviewStatus !== "invalid" &&
                        row.reviewStatus !== "already_imported" ? (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                            <div className="max-w-md flex-1">
                              <FormSelect
                                id={`row-category-${row.sourceLine}`}
                                label="Categoria"
                                value={
                                  row.confirmedCategoryId ??
                                  row.categorySuggestion?.categoryId ??
                                  ""
                                }
                                onChange={(event) =>
                                  handleRowCategoryChange(
                                    row.sourceLine,
                                    event.target.value,
                                  )
                                }
                              >
                                <option value="">Sem categoria</option>
                                {categories
                                  .filter(
                                    (category) =>
                                      category.type ===
                                      resolveImportRowTransactionType(row),
                                  )
                                  .map((category) => (
                                    <option key={category.id} value={category.id}>
                                      {category.name}
                                    </option>
                                  ))}
                              </FormSelect>
                            </div>
                            {row.categoryStatus === "suggested" &&
                            row.categorySuggestion ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleConfirmSuggestion(row.sourceLine)}
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
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Importação controlada</p>
                <p className="text-sm text-muted-foreground">
                  {committableRows.length > 0
                    ? `${committableRows.length} linha(s) nova(s) pronta(s) para gravar.`
                    : "Nenhuma linha nova e pronta para importar."}
                </p>
                {commitValidationError && committableRows.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {commitValidationError}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                disabled={
                  committing ||
                  historyLoading ||
                  committableRows.length === 0 ||
                  Boolean(commitValidationError)
                }
                onClick={() => void handleCommit()}
              >
                {committing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  `Importar ${committableRows.length} linha(s)`
                )}
              </Button>
            </CardContent>
          </Card>
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
