"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Bar, BarChart, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts";

import {
  DashboardPanelHeader,
  DashboardStatPill,
} from "@/components/finance/dashboard/dashboard-panel-header";
import { DashboardPanel } from "@/components/finance/dashboard/dashboard-panel";
import { CardContent } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ExpenseCategoryStat } from "@/lib/finance/dashboard-stats";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type ExpenseCategoriesProps = {
  loading: boolean;
  categories: ExpenseCategoryStat[];
  monthLabel: string;
  monthKey: string;
  yearSharePercent: number | null;
};

function buildChartConfig(categories: ExpenseCategoryStat[]): ChartConfig {
  return categories.reduce<ChartConfig>((config, category) => {
    config[category.name] = {
      label: category.name,
      color: category.fill,
    };
    return config;
  }, {});
}

export function ExpenseCategories({
  loading,
  categories,
  monthLabel,
  monthKey,
  yearSharePercent,
}: ExpenseCategoriesProps) {
  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  const chartConfig = buildChartConfig(categories);
  const centerValue =
    yearSharePercent !== null
      ? formatPercent(yearSharePercent / 100)
      : formatCurrency(total);
  const centerLabel =
    yearSharePercent !== null ? "Participação no ano" : "Total do mês";

  return (
    <DashboardPanel delayMs={140} className="h-full">
      <DashboardPanelHeader
        title="Despesas no mês"
        subtitle={monthLabel}
        stats={
          !loading && categories.length > 0 ? (
            <DashboardStatPill
              label="Total"
              value={formatCurrency(total)}
              tone="expense"
            />
          ) : null
        }
      />

      <CardContent className="pt-0">
        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : categories.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 text-center">
            <p className="text-sm font-medium">Nenhuma despesa neste mês</p>
            <Link
              href={`/lancamentos?month=${monthKey}&new=1`}
              className="mt-4 text-sm font-medium text-primary hover:underline"
            >
              Registrar despesa
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] md:items-center">
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-square max-h-[220px] w-full"
            >
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => [
                        formatCurrency(Number(value)),
                        String(name),
                      ]}
                    />
                  }
                />

                <Pie
                  data={categories}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="90%"
                  paddingAngle={3}
                  strokeWidth={3}
                  stroke="var(--card)"
                  isAnimationActive
                  animationDuration={850}
                  animationEasing="ease-out"
                >
                  {categories.map((category) => (
                    <Cell key={category.name} fill={category.fill} />
                  ))}

                  <Label
                    content={({ viewBox }) => {
                      if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                        return null;
                      }

                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) - 8}
                            className="fill-foreground text-xl font-semibold"
                          >
                            {centerValue}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) + 14}
                            className="fill-foreground/70 text-[11px] font-medium"
                          >
                            {centerLabel}
                          </tspan>
                        </text>
                      );
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>

            <div className="space-y-2.5">
              {categories.map((category) => (
                <div
                  key={category.name}
                  className="flex items-center justify-between gap-3 rounded-lg px-1 py-0.5 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="size-2.5 shrink-0 rounded-[4px]"
                      style={{ backgroundColor: category.fill }}
                    />
                    <span className="truncate font-medium">{category.name}</span>
                  </div>
                  <span className="shrink-0 tabular-nums text-foreground/75">
                    {category.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </DashboardPanel>
  );
}

type ExpenseBreakdownBarsProps = {
  loading: boolean;
  categories: ExpenseCategoryStat[];
  monthLabel: string;
  monthKey: string;
};

export function ExpenseBreakdownBars({
  loading,
  categories,
  monthLabel,
  monthKey,
}: ExpenseBreakdownBarsProps) {
  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  const topCategory = categories[0];
  const chartConfig = buildChartConfig(categories);
  const barData = [...categories].sort((left, right) => left.amount - right.amount);

  return (
    <DashboardPanel delayMs={260} className="dashboard-panel-featured h-full">
      <DashboardPanelHeader
        title="Detalhamento de despesas"
        subtitle={monthLabel}
        action={
          <Link
            href={`/orcamento?month=${monthKey}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Ver orçamento
          </Link>
        }
        stats={
          !loading && categories.length > 0 ? (
            <>
              <DashboardStatPill
                label="Total"
                value={formatCurrency(total)}
                tone="expense"
              />
              {topCategory ? (
                <DashboardStatPill
                  label="Maior categoria"
                  value={`${topCategory.name} · ${topCategory.percentage}%`}
                  tone="accent"
                />
              ) : null}
              <DashboardStatPill
                label="Categorias"
                value={String(categories.length)}
              />
            </>
          ) : null
        }
      />

      <CardContent className="space-y-6 pt-0">
        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : categories.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
            Sem despesas para detalhar.
          </div>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[280px] w-full sm:h-[300px]"
            >
              <BarChart
                data={barData}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 4, bottom: 4 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={108}
                  className="fill-foreground/75 text-xs font-medium"
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, _name, item) => {
                        const percentage = item.payload?.percentage;
                        return [
                          `${formatCurrency(Number(value))}${percentage != null ? ` · ${percentage}%` : ""}`,
                          "Valor",
                        ];
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="amount"
                  radius={[0, 10, 10, 0]}
                  barSize={22}
                  isAnimationActive
                  animationDuration={850}
                >
                  {barData.map((category) => (
                    <Cell key={category.name} fill={category.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {categories.map((category, index) => (
                <div
                  key={category.name}
                  className={cn(
                    "rounded-2xl border border-border/50 bg-muted/15 p-4 ring-1 ring-inset ring-white/5",
                    index === 0 && "border-primary/25 bg-primary/5",
                  )}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-[4px]"
                          style={{ backgroundColor: category.fill }}
                        />
                        <p className="truncate font-medium">{category.name}</p>
                      </div>
                      <p className="text-lg font-semibold tabular-nums tracking-tight">
                        {formatCurrency(category.amount)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-background/60 px-2 py-1 text-sm font-semibold tabular-nums ring-1 ring-inset ring-white/5">
                      {category.percentage}%
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-muted/80">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${category.percentage}%`,
                        backgroundColor: category.fill,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </DashboardPanel>
  );
}
