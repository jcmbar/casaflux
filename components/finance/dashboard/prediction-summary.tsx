import Link from "next/link";
import { Loader2 } from "lucide-react";

import {
  DashboardPanelHeader,
} from "@/components/finance/dashboard/dashboard-panel-header";
import { DashboardPanel } from "@/components/finance/dashboard/dashboard-panel";
import { CardContent } from "@/components/ui/card";
import {
  getPredictionDiff,
} from "@/lib/finance/prediction-diff";
import type { MonthlyPredictionAggregates } from "@/lib/finance/prediction-aggregates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type PredictionSummaryProps = {
  loading: boolean;
  aggregates: MonthlyPredictionAggregates;
  monthKey: string;
  monthLabel: string;
};

export function PredictionSummary({
  loading,
  aggregates,
  monthKey,
  monthLabel,
}: PredictionSummaryProps) {
  const diff = getPredictionDiff(aggregates.predicted, aggregates.realized);
  const deltaDescription =
    diff.kind === "equal"
      ? "Igual ao previsto"
      : `${formatCurrency(diff.amount)} ${
          diff.kind === "above" ? "acima" : "abaixo"
        } do previsto`;

  return (
    <DashboardPanel>
      <DashboardPanelHeader
        title="Previsto vs realizado"
        subtitle={`Previsões agendadas em ${monthLabel} e valores já liquidados.`}
        action={
          <Link
            href={`/lancamentos?month=${monthKey}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Ver detalhes
          </Link>
        }
      />
      <CardContent className="pt-0">
        {loading ? (
          <div className="flex min-h-20 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div
            className="grid divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
            data-testid="dashboard-prediction-aggregates"
          >
            <div className="space-y-1 py-3 first:pt-0 sm:px-4 sm:py-0 sm:first:pl-0">
              <p className="text-sm text-muted-foreground">Total previsto</p>
              <p
                className="text-xl font-semibold tabular-nums sm:text-2xl"
                data-testid="dashboard-predicted-total"
              >
                {formatCurrency(aggregates.predicted)}
              </p>
            </div>

            <div className="space-y-1 py-3 sm:px-4 sm:py-0">
              <p className="text-sm text-muted-foreground">Total realizado</p>
              <p
                className="text-xl font-semibold tabular-nums sm:text-2xl"
                data-testid="dashboard-realized-total"
              >
                {formatCurrency(aggregates.realized)}
              </p>
            </div>

            <div className="space-y-1 py-3 last:pb-0 sm:px-4 sm:py-0 sm:last:pr-0">
              <p className="text-sm text-muted-foreground">Delta do período</p>
              <p
                className={cn(
                  "text-xl font-semibold tabular-nums sm:text-2xl",
                  diff.kind === "above" &&
                    "text-amber-600 dark:text-amber-400",
                  diff.kind === "below" && "text-primary",
                )}
                data-testid="dashboard-prediction-delta"
              >
                {formatCurrency(Math.abs(aggregates.delta))}
              </p>
              <p
                className={cn(
                  "text-xs",
                  diff.kind === "equal" && "text-muted-foreground",
                  diff.kind === "above" &&
                    "font-medium text-amber-600 dark:text-amber-400",
                  diff.kind === "below" && "font-medium text-primary",
                )}
              >
                {deltaDescription}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </DashboardPanel>
  );
}
