"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  List,
  SkipForward,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ImportRowCategoryField } from "@/components/finance/import-row-category-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { applyHighConfidenceWithPropagation } from "@/lib/integrations/categories/import-category-propagation";
import {
  formatImportCategoryPropagationLabel,
  getSimilarUncategorizedLines,
  type ImportCategoryPropagationOffer,
} from "@/lib/integrations/categories/import-category-propagation";
import type { CategorySuggestionCatalogItem } from "@/lib/integrations/categories/category-suggester";
import type { ImportCategoryFeedback } from "@/lib/integrations/categories/import-category-feedback";
import {
  DEFAULT_IMPORT_CATEGORY_REVIEW_MODE,
  getAssistedReviewRow,
  getImportCategoryReviewProgress,
  getImportCategoryReviewQueue,
  getNextAssistedReviewIndex,
  IMPORT_CATEGORY_REVIEW_MODE_LABELS,
  clampAssistedReviewIndex,
  partitionImportCategoryReviewRows,
  type ImportCategoryReviewMode,
} from "@/lib/integrations/categories/import-category-review";
import { resolveImportRowTransactionType } from "@/lib/integrations/categories/category-suggester";
import { resolveImportCategoryStatusLabel } from "@/lib/integrations/categories/category-suggestion-service";
import type { ImportPreviewRow } from "@/lib/integrations/types";
import type { Category } from "@/types/category";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";

const categorySourceLabels: Record<
  NonNullable<ImportPreviewRow["categorySuggestion"]>["source"],
  string
> = {
  exact_match: "Match exato",
  normalized_merchant: "Merchant normalizado",
  historical_frequency: "Frequência histórica",
};

function CategoryReviewProgressBar({
  rows,
}: {
  rows: ImportPreviewRow[];
}) {
  const progress = getImportCategoryReviewProgress(rows);

  return (
    <Progress value={progress.percent} className="w-full">
      <ProgressLabel>Categorização</ProgressLabel>
      <ProgressValue>
        {() => `${progress.resolved}/${progress.total}`}
      </ProgressValue>
    </Progress>
  );
}

function CategoryReviewModeSwitch({
  mode,
  onModeChange,
}: {
  mode: ImportCategoryReviewMode;
  onModeChange: (mode: ImportCategoryReviewMode) => void;
}) {
  const modes: ImportCategoryReviewMode[] = ["assisted", "automatic", "manual"];

  return (
    <div className="flex flex-wrap gap-2">
      {modes.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={mode === option ? "default" : "outline"}
          onClick={() => onModeChange(option)}
          data-testid={`import-category-mode-${option}`}
        >
          {IMPORT_CATEGORY_REVIEW_MODE_LABELS[option]}
        </Button>
      ))}
    </div>
  );
}

function CategoryReviewRowSummary({ row }: { row: ImportPreviewRow }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">L{row.sourceLine}</Badge>
        <span className="text-sm font-medium">{row.description}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>{formatDate(row.date)}</span>
        <span>
          {row.direction === "out" ? "-" : "+"}
          {formatCurrency(row.amount)}
        </span>
      </div>
      {row.categorySuggestion ? (
        <p className="text-xs text-muted-foreground">
          Sugestão:{" "}
          <span className="font-medium text-foreground">
            {row.categorySuggestion.categoryName}
          </span>{" "}
          · {categorySourceLabels[row.categorySuggestion.source]} · confiança{" "}
          {row.categorySuggestion.confidence}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sem sugestão automática. Escolha uma categoria ou crie uma nova.
        </p>
      )}
    </div>
  );
}

function SimilarLinesHint({
  rows,
  sourceLine,
  mode,
}: {
  rows: ImportPreviewRow[];
  sourceLine: number;
  mode: ImportCategoryReviewMode;
}) {
  const similarCount = getSimilarUncategorizedLines(rows, sourceLine).length;
  if (similarCount === 0) {
    return null;
  }

  return (
    <p
      className="text-xs text-sky-800 dark:text-sky-200"
      data-testid={`import-category-similar-hint-${sourceLine}`}
    >
      {mode === "manual"
        ? `${similarCount} linha(s) semelhante(s) aguardando revisão.`
        : formatImportCategoryPropagationLabel(similarCount)}
    </p>
  );
}

function PropagationOfferBanner({
  offer,
  onAccept,
  onDismiss,
}: {
  offer: ImportCategoryPropagationOffer;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-4"
      data-testid="import-category-propagation-offer"
    >
      <p className="text-sm font-medium">
        Aplicar &quot;{offer.categoryName}&quot; às linhas semelhantes?
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Grupo {offer.group.label} ·{" "}
        {formatImportCategoryPropagationLabel(offer.similarLines.length)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onAccept}>
          {formatImportCategoryPropagationLabel(offer.similarLines.length)}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDismiss}>
          Agora não
        </Button>
      </div>
    </div>
  );
}

function CategoryReviewRowEditor({
  row,
  categories,
  categoryFeedback,
  userId,
  onCategoryChange,
  onCategorySaved,
}: {
  row: ImportPreviewRow;
  categories: Category[];
  categoryFeedback: ImportCategoryFeedback | null;
  userId: string;
  onCategoryChange: (categoryId: string) => void;
  onCategorySaved: (
    category: Category,
    sourceLine: number,
    mode: "create" | "update",
  ) => void;
}) {
  return (
    <ImportRowCategoryField
      sourceLine={row.sourceLine}
      transactionType={resolveImportRowTransactionType(row)}
      categories={categories}
      selectedCategoryId={
        row.confirmedCategoryId ?? row.categorySuggestion?.categoryId ?? ""
      }
      categoryFeedback={categoryFeedback}
      onCategoryChange={onCategoryChange}
      onCategorySaved={onCategorySaved}
      userId={userId}
    />
  );
}

function AssistedCategoryReview({
  row,
  queueLength,
  index,
  categories,
  categoryFeedback,
  userId,
  onConfirm,
  onSkip,
  onPrevious,
  onNext,
  onCategoryChange,
  onCategorySaved,
  similarLinesHint,
}: {
  row: ImportPreviewRow;
  queueLength: number;
  index: number;
  categories: Category[];
  categoryFeedback: ImportCategoryFeedback | null;
  userId: string;
  onConfirm: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onCategoryChange: (categoryId: string) => void;
  onCategorySaved: (
    category: Category,
    sourceLine: number,
    mode: "create" | "update",
  ) => void;
  similarLinesHint?: React.ReactNode;
}) {
  return (
    <Card
      className="border-primary/20 shadow-sm"
      data-testid="import-category-assisted-card"
    >
      <CardContent className="space-y-4 px-4 py-5">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Linha {index + 1} de {queueLength}
          </span>
          <Badge variant="outline">
            {resolveImportCategoryStatusLabel(row.categoryStatus ?? "none")}
          </Badge>
        </div>

        <CategoryReviewRowSummary row={row} />
        {similarLinesHint}

        <CategoryReviewRowEditor
          row={row}
          categories={categories}
          categoryFeedback={categoryFeedback}
          userId={userId}
          onCategoryChange={onCategoryChange}
          onCategorySaved={onCategorySaved}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            data-testid="import-category-assisted-confirm"
          >
            <Check className="size-3.5" />
            {row.categorySuggestion ? "Confirmar sugestão" : "Confirmar"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onSkip}>
            <SkipForward className="size-3.5" />
            Pular
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={onPrevious}
            disabled={queueLength <= 1}
            aria-label="Linha anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={onNext}
            disabled={queueLength <= 1}
            aria-label="Próxima linha"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ManualCategoryReviewList({
  rows,
  allRows,
  mode,
  categories,
  categoryFeedbackByLine,
  userId,
  onCategoryChange,
  onCategorySaved,
  onConfirmSuggestion,
  showResolved,
}: {
  rows: ImportPreviewRow[];
  allRows: ImportPreviewRow[];
  mode: ImportCategoryReviewMode;
  categories: Category[];
  categoryFeedbackByLine: Record<number, ImportCategoryFeedback>;
  userId: string;
  onCategoryChange: (sourceLine: number, categoryId: string) => void;
  onCategorySaved: (
    category: Category,
    sourceLine: number,
    mode: "create" | "update",
  ) => void;
  onConfirmSuggestion: (sourceLine: number) => void;
  showResolved: boolean;
}) {
  const visibleRows = showResolved
    ? rows
    : rows.filter((row) => row.categoryStatus !== "confirmed");

  if (visibleRows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        {showResolved
          ? "Nenhuma linha categorizável neste arquivo."
          : "Todas as linhas categorizáveis foram revisadas."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleRows.map((row) => (
        <div
          key={`manual-category-${row.sourceLine}`}
          className={cn(
            "rounded-xl border border-border/50 px-4 py-4",
            row.categoryStatus === "confirmed" && "bg-emerald-500/5",
          )}
          data-testid={`import-category-manual-row-${row.sourceLine}`}
        >
          <CategoryReviewRowSummary row={row} />
          {mode === "manual" ? (
            <SimilarLinesHint rows={allRows} sourceLine={row.sourceLine} mode={mode} />
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <CategoryReviewRowEditor
              row={row}
              categories={categories}
              categoryFeedback={categoryFeedbackByLine[row.sourceLine] ?? null}
              userId={userId}
              onCategoryChange={(categoryId) =>
                onCategoryChange(row.sourceLine, categoryId)
              }
              onCategorySaved={onCategorySaved}
            />
            {row.categoryStatus === "suggested" && row.categorySuggestion ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onConfirmSuggestion(row.sourceLine)}
              >
                Confirmar sugestão
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ImportCategoryReviewPanel({
  rows,
  categories,
  categoryCatalog,
  categoryFeedbackByLine,
  userId,
  loading = false,
  mode: controlledMode,
  onModeChange,
  onRowsChange,
  onCategoryChange,
  onCategorySaved,
  onConfirmSuggestion,
  showFullList,
  onShowFullListChange,
  propagationOffer = null,
  onAcceptPropagation,
  onDismissPropagation,
}: {
  rows: ImportPreviewRow[];
  categories: Category[];
  categoryCatalog: CategorySuggestionCatalogItem[];
  categoryFeedbackByLine: Record<number, ImportCategoryFeedback>;
  userId: string;
  loading?: boolean;
  mode?: ImportCategoryReviewMode;
  onModeChange?: (mode: ImportCategoryReviewMode) => void;
  onRowsChange: (rows: ImportPreviewRow[]) => void;
  onCategoryChange: (sourceLine: number, categoryId: string) => void;
  onCategorySaved: (
    category: Category,
    sourceLine: number,
    mode: "create" | "update",
  ) => void;
  onConfirmSuggestion: (sourceLine: number) => void;
  showFullList?: boolean;
  onShowFullListChange?: (show: boolean) => void;
  propagationOffer?: ImportCategoryPropagationOffer | null;
  onAcceptPropagation?: () => void;
  onDismissPropagation?: () => void;
}) {
  const [internalMode, setInternalMode] = useState<ImportCategoryReviewMode>(
    DEFAULT_IMPORT_CATEGORY_REVIEW_MODE,
  );
  const [assistedIndex, setAssistedIndex] = useState(0);
  const [internalShowFullList, setInternalShowFullList] = useState(false);
  const [automaticApplied, setAutomaticApplied] = useState(false);

  const mode = controlledMode ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;
  const fullListVisible = showFullList ?? internalShowFullList;
  const setFullListVisible = onShowFullListChange ?? setInternalShowFullList;

  const partition = useMemo(
    () => partitionImportCategoryReviewRows(rows, mode),
    [mode, rows],
  );
  const assistedQueue = useMemo(
    () => getImportCategoryReviewQueue(rows, "assisted"),
    [rows],
  );
  const assistedRow = getAssistedReviewRow(rows, "assisted", assistedIndex);

  useEffect(() => {
    setAssistedIndex((current) =>
      clampAssistedReviewIndex(current, assistedQueue.length),
    );
  }, [assistedQueue.length]);

  useEffect(() => {
    if (mode !== "automatic" || automaticApplied) {
      return;
    }

    const nextRows = applyHighConfidenceWithPropagation(rows, categoryCatalog, mode);
    onRowsChange(nextRows);
    setAutomaticApplied(true);
  }, [automaticApplied, categoryCatalog, mode, onRowsChange, rows]);

  useEffect(() => {
    if (mode !== "automatic") {
      setAutomaticApplied(false);
    }
  }, [mode]);

  function handleAssistedConfirm() {
    if (!assistedRow) {
      return;
    }

    if (assistedRow.categoryStatus !== "confirmed") {
      if (assistedRow.categorySuggestion) {
        onConfirmSuggestion(assistedRow.sourceLine);
      } else {
        return;
      }
    }

    setAssistedIndex((current) =>
      getNextAssistedReviewIndex(current, assistedQueue.length, "confirm"),
    );
  }

  function handleAssistedSkip() {
    setAssistedIndex((current) =>
      getNextAssistedReviewIndex(current, assistedQueue.length, "skip"),
    );
  }

  function handleAssistedPrevious() {
    setAssistedIndex((current) => Math.max(0, current - 1));
  }

  function handleAssistedNext() {
    setAssistedIndex((current) =>
      getNextAssistedReviewIndex(current, assistedQueue.length, "next"),
    );
  }

  return (
    <Card className="border-border/50 shadow-sm" data-testid="import-category-review-panel">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Revisão de categorias</CardTitle>
            <p className="text-sm text-muted-foreground">
              Escolha como revisar as categorias antes do commit. Categorias novas
              só são criadas quando você solicitar.
            </p>
          </div>
          <CategoryReviewModeSwitch mode={mode} onModeChange={setMode} />
        </div>

        <CategoryReviewProgressBar rows={rows} />
      </CardHeader>

      <CardContent className="space-y-4">
        {propagationOffer && mode === "assisted" && onAcceptPropagation && onDismissPropagation ? (
          <PropagationOfferBanner
            offer={propagationOffer}
            onAccept={onAcceptPropagation}
            onDismiss={onDismissPropagation}
          />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Resolvidas automaticamente
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {partition.autoResolved.length}
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sugeridas para revisão
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {partition.needsReview.length}
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sem categoria
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {partition.withoutCategory.length}
            </p>
          </div>
        </div>

        {mode === "automatic" ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4">
              <div className="flex items-start gap-3">
                <Wand2 className="mt-0.5 size-4 text-emerald-700 dark:text-emerald-300" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Resumo automático</p>
                  <p className="text-sm text-muted-foreground">
                    {partition.autoResolved.length > 0
                      ? `${partition.autoResolved.length} linha(s) de alta confiança foram confirmadas automaticamente.`
                      : "Nenhuma linha de alta confiança para aplicar automaticamente."}
                    {partition.pending.length > 0
                      ? ` ${partition.pending.length} exceção(ões) ainda precisam de revisão antes do commit.`
                      : " Todas as linhas categorizáveis estão resolvidas."}
                  </p>
                </div>
              </div>
            </div>

            {partition.pending.length > 0 ? (
              <ManualCategoryReviewList
                rows={partition.pending}
                allRows={rows}
                mode={mode}
                categories={categories}
                categoryFeedbackByLine={categoryFeedbackByLine}
                userId={userId}
                onCategoryChange={onCategoryChange}
                onCategorySaved={onCategorySaved}
                onConfirmSuggestion={onConfirmSuggestion}
                showResolved={false}
              />
            ) : null}
          </div>
        ) : null}

        {mode === "assisted" ? (
          assistedRow ? (
            <AssistedCategoryReview
              row={assistedRow}
              queueLength={assistedQueue.length}
              index={assistedIndex}
              categories={categories}
              categoryFeedback={categoryFeedbackByLine[assistedRow.sourceLine] ?? null}
              userId={userId}
              onConfirm={handleAssistedConfirm}
              onSkip={handleAssistedSkip}
              onPrevious={handleAssistedPrevious}
              onNext={handleAssistedNext}
              onCategoryChange={(categoryId) =>
                onCategoryChange(assistedRow.sourceLine, categoryId)
              }
              onCategorySaved={onCategorySaved}
              similarLinesHint={
                <SimilarLinesHint rows={rows} sourceLine={assistedRow.sourceLine} mode={mode} />
              }
            />
          ) : (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-6 text-center">
              <Sparkles className="mx-auto size-5 text-emerald-700 dark:text-emerald-300" />
              <p className="mt-2 text-sm font-medium">
                Categorização concluída neste modo
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Todas as linhas categorizáveis foram revisadas.
              </p>
            </div>
          )
        ) : null}

        {mode === "manual" ? (
          fullListVisible ? (
            <div className="rounded-xl border border-border/50 bg-muted/15 px-4 py-4 text-sm text-muted-foreground">
              A lista completa está aberta abaixo com todos os campos de categoria.
            </div>
          ) : (
            <ManualCategoryReviewList
              rows={[
                ...partition.pending,
                ...partition.confirmed,
                ...partition.autoResolved,
              ]}
              allRows={rows}
              mode={mode}
              categories={categories}
              categoryFeedbackByLine={categoryFeedbackByLine}
              userId={userId}
              onCategoryChange={onCategoryChange}
              onCategorySaved={onCategorySaved}
              onConfirmSuggestion={onConfirmSuggestion}
              showResolved={false}
            />
          )
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-4">
          <p className="text-xs text-muted-foreground">
            {loading
              ? "Carregando sugestões de categoria..."
              : `${getImportCategoryReviewProgress(rows).resolved} de ${getImportCategoryReviewProgress(rows).total} linhas categorizáveis revisadas`}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setFullListVisible(!fullListVisible)}
            data-testid="import-category-toggle-full-list"
          >
            <List className="size-3.5" />
            {fullListVisible ? "Ocultar lista completa" : "Abrir lista completa"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
