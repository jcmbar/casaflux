"use client";

import { formatCurrency } from "@/lib/format";
import type { ImportFinancialSummary } from "@/lib/integrations/core/import-financial-summary";
import type { ImportPreview } from "@/lib/integrations/types";
import { cn } from "@/lib/utils";

export function DenseStat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[3.25rem] flex-col justify-between rounded-lg border border-border/40 bg-muted/10 px-2.5 py-1.5",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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
            />
            <DenseStat
              label="Pagamentos"
              value={formatCurrency(financialSummary.paymentsTotal)}
              hint={
                paymentCount === 0
                  ? "Nenhum"
                  : `${paymentCount} crédito${paymentCount === 1 ? "" : "s"}`
              }
            />
          </>
        ) : null}
        <DenseStat label="Fonte" value={sourceLabel} />
        <DenseStat
          label="Novas / já"
          value={`${preview.summary.historicalNewRowCount}/${preview.summary.historicalAlreadyImportedRowCount}`}
        />
        <DenseStat
          label="Revisão"
          value={`${preview.needsReview.length} pend.`}
          hint={`${preview.summary.validRows} ok · ${preview.summary.invalidRows} invál.`}
        />
      </div>
    </div>
  );
}
