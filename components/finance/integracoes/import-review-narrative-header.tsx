"use client";

import { formatCurrency } from "@/lib/format";
import type { ImportFinancialSummary } from "@/lib/integrations/core/import-financial-summary";
import type { ImportPreview } from "@/lib/integrations/types";
import { cn } from "@/lib/utils";

type DenseStatTone =
  | "primary"
  | "success"
  | "info"
  | "context"
  | "attention"
  | "danger"
  | "neutral";

const denseStatToneClassName: Record<
  DenseStatTone,
  { shell: string; label: string; chip: string }
> = {
  primary: {
    shell: "border-primary/20 bg-primary/[0.04]",
    label: "text-primary/80",
    chip: "bg-primary/70",
  },
  success: {
    shell:
      "border-emerald-500/20 bg-emerald-500/[0.04] dark:border-emerald-400/20 dark:bg-emerald-400/[0.05]",
    label: "text-emerald-800/80 dark:text-emerald-200/80",
    chip: "bg-emerald-500/80 dark:bg-emerald-400/80",
  },
  info: {
    shell:
      "border-sky-500/20 bg-sky-500/[0.04] dark:border-sky-400/20 dark:bg-sky-400/[0.05]",
    label: "text-sky-800/80 dark:text-sky-200/80",
    chip: "bg-sky-500/80 dark:bg-sky-400/80",
  },
  context: {
    shell:
      "border-violet-500/20 bg-violet-500/[0.04] dark:border-violet-400/20 dark:bg-violet-400/[0.05]",
    label: "text-violet-800/80 dark:text-violet-200/80",
    chip: "bg-violet-500/75 dark:bg-violet-400/75",
  },
  attention: {
    shell:
      "border-amber-500/25 bg-amber-500/[0.05] dark:border-amber-400/20 dark:bg-amber-400/[0.06]",
    label: "text-amber-900/80 dark:text-amber-100/80",
    chip: "bg-amber-500/80 dark:bg-amber-400/80",
  },
  danger: {
    shell:
      "border-destructive/25 bg-destructive/[0.04] dark:border-destructive/30 dark:bg-destructive/[0.06]",
    label: "text-destructive/90",
    chip: "bg-destructive/80",
  },
  neutral: {
    shell: "border-border/40 bg-muted/10",
    label: "text-muted-foreground",
    chip: "bg-muted-foreground/45",
  },
};

export function DenseStat({
  label,
  value,
  hint,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: DenseStatTone;
  className?: string;
}) {
  const toneClassName = denseStatToneClassName[tone];

  return (
    <div
      className={cn(
        "flex min-h-[3.25rem] flex-col justify-between rounded-lg border px-2.5 py-1.5",
        toneClassName.shell,
        className,
      )}
      data-tone={tone}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide",
          toneClassName.label,
        )}
      >
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", toneClassName.chip)}
        />
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums leading-tight text-foreground">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : (
        <span className="mt-0.5 block h-4" aria-hidden />
      )}
    </div>
  );
}

function resolveReviewStatTone(preview: ImportPreview): DenseStatTone {
  if (preview.summary.invalidRows > 0) {
    return "danger";
  }
  if (preview.needsReview.length > 0) {
    return "attention";
  }
  return "success";
}

export function ImportReviewNarrativeHeader({
  cardName,
  financialSummary,
  preview,
  sourceLabel,
  contextHeadline,
}: {
  cardName?: string | null;
  financialSummary: ImportFinancialSummary | null;
  preview: ImportPreview;
  sourceLabel: string;
  contextHeadline?: string | null;
}) {
  const paymentCount = financialSummary?.paymentCount ?? 0;
  const invoiceTotal = financialSummary?.invoiceTotal;
  const reviewTone = resolveReviewStatTone(preview);

  return (
    <div
      className="space-y-2.5 rounded-xl border border-border/50 bg-card px-3 py-2.5 shadow-sm"
      data-testid="import-review-narrative-header"
    >
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-foreground">
          {cardName
            ? `${cardName}${
                invoiceTotal != null
                  ? ` · ${formatCurrency(invoiceTotal)}`
                  : ""
              }`
            : sourceLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          {preview.summary.totalRows} linha
          {preview.summary.totalRows === 1 ? "" : "s"}
          {paymentCount > 0
            ? ` · ${paymentCount} pagamento${paymentCount === 1 ? "" : "s"}`
            : ""}
          {contextHeadline ? ` · ${contextHeadline}` : ""}
        </p>
      </div>

      <div
        className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5"
        data-testid="import-review-dense-stats"
      >
        {financialSummary ? (
          <>
            <DenseStat
              label="Total da fatura"
              value={formatCurrency(financialSummary.invoiceTotal)}
              tone="primary"
            />
            <DenseStat
              label="Pagamentos"
              value={formatCurrency(financialSummary.paymentsTotal)}
              tone="success"
              hint={
                paymentCount === 0
                  ? "Nenhum"
                  : `${paymentCount} crédito${paymentCount === 1 ? "" : "s"}`
              }
            />
          </>
        ) : null}
        <DenseStat label="Fonte" value={sourceLabel} tone="info" />
        <DenseStat
          label="Novas / já"
          value={`${preview.summary.historicalNewRowCount}/${preview.summary.historicalAlreadyImportedRowCount}`}
          tone="context"
        />
        <DenseStat
          label="Revisão"
          value={`${preview.needsReview.length} pend.`}
          tone={reviewTone}
          hint={`${preview.summary.validRows} ok · ${preview.summary.invalidRows} invál.`}
        />
      </div>
    </div>
  );
}
