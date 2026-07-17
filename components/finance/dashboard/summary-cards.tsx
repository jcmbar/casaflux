import Link from "next/link";
import { Loader2, Wallet } from "lucide-react";

import { MiniSparkline } from "@/components/finance/dashboard/mini-sparkline";
import { CardContent } from "@/components/ui/card";
import type { MonthSummary, SparklinePoint } from "@/lib/finance/dashboard-stats";
import { getProjectedMonthlyBalance } from "@/lib/finance/prediction-aggregates";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type SummaryCardsProps = {
  loading: boolean;
  monthSummary: MonthSummary;
  totalAccountBalance: number;
  monthlyProjectionDelta: number;
  sparklines: {
    net: SparklinePoint[];
    income: SparklinePoint[];
    expense: SparklinePoint[];
  };
};

type KpiCard = {
  title: string;
  value: string;
  change: string;
  tone: "income" | "expense" | "neutral";
  sparkline: SparklinePoint[] | null;
  sparkVariant: "income" | "expense" | "neutral" | "inverted";
  surface: "income" | "expense" | "neutral";
  testId: string;
  wide?: boolean;
};

export function SummaryCards({
  loading,
  monthSummary,
  totalAccountBalance,
  monthlyProjectionDelta,
  sparklines,
}: SummaryCardsProps) {
  const netChangeLabel =
    monthSummary.netChangePercent === null
      ? "Sem base no mês anterior"
      : `${monthSummary.netChangePercent >= 0 ? "+" : ""}${formatPercent(monthSummary.netChangePercent / 100)} vs mês passado`;
  const projectedBalance = getProjectedMonthlyBalance(
    monthSummary.netBalance,
    monthlyProjectionDelta,
  );

  const cards: KpiCard[] = [
    {
      title: "Saldo real do mês",
      value: formatCurrency(monthSummary.netBalance),
      change: netChangeLabel,
      tone: monthSummary.netBalance >= 0 ? "income" : "expense",
      sparkline: sparklines.net,
      sparkVariant: "inverted",
      surface: "income",
      testId: "kpi-net",
    },
    {
      title: "Despesas do mês",
      value: formatCurrency(monthSummary.expense),
      change:
        monthSummary.expenseCount === 1
          ? "1 lançamento"
          : `${monthSummary.expenseCount} lançamentos`,
      tone: "expense",
      sparkline: sparklines.expense,
      sparkVariant: "expense",
      surface: "expense",
      testId: "kpi-expense",
    },
    {
      title: "Receitas do mês",
      value: formatCurrency(monthSummary.income),
      change:
        monthSummary.incomeCount === 1
          ? "1 lançamento"
          : `${monthSummary.incomeCount} lançamentos`,
      tone: "income",
      sparkline: sparklines.income,
      sparkVariant: "income",
      surface: "neutral",
      testId: "kpi-income",
    },
    {
      title: "Saldo em contas",
      value: formatCurrency(totalAccountBalance),
      change: "Saldos cadastrados",
      tone: "neutral",
      sparkline: null,
      sparkVariant: "neutral",
      surface: "neutral",
      testId: "kpi-accounts",
    },
    {
      title: "Saldo projetado do mês",
      value: formatCurrency(projectedBalance),
      change:
        monthlyProjectionDelta === 0
          ? "Sem previsões pendentes marcadas"
          : `${monthlyProjectionDelta > 0 ? "+" : "-"}${formatCurrency(
              Math.abs(monthlyProjectionDelta),
            )} em previsões pendentes marcadas`,
      tone: projectedBalance >= 0 ? "income" : "expense",
      sparkline: null,
      sparkVariant: "neutral",
      surface: "neutral",
      testId: "kpi-projected",
      wide: true,
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-muted-foreground capitalize">
          {monthSummary.monthLabel}
        </p>
        <Link
          href={`/lancamentos?month=${monthSummary.monthKey}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Ver lançamentos
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card, index) => {
          const isElevated =
            card.surface === "income" || card.surface === "expense";

          return (
            <div
              key={card.title}
              className={cn(
                "animate-enter overflow-hidden rounded-2xl border border-border/40 ring-1 ring-inset ring-white/5",
                card.surface === "income" && "dashboard-kpi-hero",
                card.surface === "expense" && "dashboard-kpi-expense",
                card.surface === "neutral" && "dashboard-kpi-subtle bg-card",
                card.wide && "sm:col-span-2",
              )}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <CardContent className="relative pt-0">
                <div className="flex items-stretch justify-between gap-3">
                  <div className="flex min-w-0 flex-col justify-center space-y-1.5 py-1">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isElevated
                          ? "text-dashboard-elevated-muted"
                          : "text-muted-foreground",
                      )}
                    >
                      {card.title}
                    </span>

                    {loading ? (
                      <Loader2
                        className={cn(
                          "h-5 w-5 animate-spin",
                          isElevated
                            ? "text-dashboard-elevated-muted"
                            : "text-muted-foreground",
                        )}
                      />
                    ) : (
                      <p
                        className={cn(
                          "text-2xl font-semibold tracking-tight tabular-nums sm:text-[1.65rem]",
                          isElevated && "text-dashboard-elevated-foreground",
                        )}
                        data-testid={card.testId}
                      >
                        {card.value}
                      </p>
                    )}

                    <p
                      className={cn(
                        "text-xs sm:text-sm",
                        isElevated
                          ? "text-dashboard-elevated-muted"
                          : card.tone === "income"
                            ? "text-primary"
                            : card.tone === "expense"
                              ? "text-destructive"
                              : "text-muted-foreground",
                      )}
                    >
                      {card.change}
                    </p>
                  </div>

                  {card.sparkline && !loading ? (
                    <MiniSparkline
                      data={card.sparkline}
                      variant={card.sparkVariant}
                      compact
                    />
                  ) : !loading && card.surface === "neutral" ? (
                    <div className="flex max-w-[140px] flex-1 items-center justify-end">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground ring-1 ring-inset ring-white/5">
                        <Wallet className="size-5" />
                      </div>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </div>
          );
        })}
      </div>
    </section>
  );
}
