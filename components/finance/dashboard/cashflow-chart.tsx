"use client";

import { Loader2 } from "lucide-react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

import {
  DashboardPanelHeader,
  DashboardStatPill,
} from "@/components/finance/dashboard/dashboard-panel-header";
import { DashboardPanel } from "@/components/finance/dashboard/dashboard-panel";
import { CardContent } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { DailyCashflowPoint } from "@/lib/finance/dashboard-stats";
import { formatCurrency } from "@/lib/format";

const chartConfig = {
  income: {
    label: "Receitas",
    color: "var(--chart-1)",
  },
  expense: {
    label: "Despesas",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

type CashflowChartProps = {
  loading: boolean;
  data: DailyCashflowPoint[];
  monthLabel: string;
  totalIncome: number;
  totalExpense: number;
};

export function CashflowChart({
  loading,
  data,
  monthLabel,
  totalIncome,
  totalExpense,
}: CashflowChartProps) {
  const hasActivity = data.some(
    (point) => point.income > 0 || point.expense > 0,
  );

  return (
    <DashboardPanel delayMs={180} className="dashboard-panel-featured">
      <DashboardPanelHeader
        title="Receitas e despesas"
        subtitle={monthLabel}
        stats={
          !loading ? (
            <>
              <DashboardStatPill
                label="Receitas"
                value={formatCurrency(totalIncome)}
                tone="income"
              />
              <DashboardStatPill
                label="Despesas"
                value={formatCurrency(totalExpense)}
                tone="expense"
              />
              <DashboardStatPill
                label="Saldo"
                value={formatCurrency(totalIncome - totalExpense)}
                tone="accent"
              />
            </>
          ) : null
        }
      />

      <CardContent className="pt-0">
        {loading ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando gráfico...
          </div>
        ) : !hasActivity ? (
          <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Sem movimentações neste mês para exibir o gráfico.
            </p>
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[min(340px,42vw)] min-h-[300px] w-full sm:h-[320px]"
          >
            <AreaChart
              data={data}
              margin={{ top: 16, right: 16, left: 4, bottom: 4 }}
            >
              <defs>
                <linearGradient id="cashflowIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-income)"
                    stopOpacity={0.5}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-income)"
                    stopOpacity={0}
                  />
                </linearGradient>
                <linearGradient id="cashflowExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-expense)"
                    stopOpacity={0.42}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-expense)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                interval="preserveStartEnd"
                minTickGap={28}
                className="text-xs fill-foreground/65"
              />

              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                width={76}
                tickCount={5}
                className="text-xs fill-foreground/65"
                tickFormatter={(value) =>
                  new Intl.NumberFormat("pt-BR", {
                    notation: "compact",
                    compactDisplay: "short",
                  }).format(Number(value))
                }
              />

              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const day = payload?.[0]?.payload?.label;
                      return day ? `Dia ${day}` : "Dia";
                    }}
                    formatter={(value, name) => [
                      formatCurrency(Number(value)),
                      chartConfig[name as keyof typeof chartConfig]?.label ??
                        name,
                    ]}
                  />
                }
              />

              <Area
                type="natural"
                dataKey="income"
                stroke="var(--color-income)"
                fill="url(#cashflowIncome)"
                strokeWidth={3}
                className="dashboard-chart-glow-income"
                isAnimationActive
                animationDuration={950}
                animationEasing="ease-out"
              />

              <Area
                type="natural"
                dataKey="expense"
                stroke="var(--color-expense)"
                fill="url(#cashflowExpense)"
                strokeWidth={3}
                className="dashboard-chart-glow-expense"
                isAnimationActive
                animationDuration={950}
                animationEasing="ease-out"
              />

              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </DashboardPanel>
  );
}
