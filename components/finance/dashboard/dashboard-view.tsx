"use client";

import { AlertCircle, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { CashflowChart } from "@/components/finance/dashboard/cashflow-chart";
import {
  ExpenseBreakdownBars,
  ExpenseCategories,
} from "@/components/finance/dashboard/expense-categories";
import { FamilyOverview } from "@/components/finance/dashboard/family-overview";
import { GoalsHighlight } from "@/components/finance/dashboard/goals-highlight";
import { MemberParticipationRow } from "@/components/finance/dashboard/member-participation-row";
import { PredictionSummary } from "@/components/finance/dashboard/prediction-summary";
import { RecentTransactions } from "@/components/finance/dashboard/recent-transactions";
import { SummaryCards } from "@/components/finance/dashboard/summary-cards";
import { useDashboardData } from "@/components/finance/dashboard/use-dashboard-data";
import { useAppContext } from "@/contexts/app-context";

export function DashboardView() {
  const { activeFamily } = useAppContext();
  const {
    loading,
    error,
    monthSummary,
    expenseCategories,
    recentTransactions,
    memberStats,
    memberParticipation,
    yearExpenseSharePercent,
    dailyCashflow,
    sparklines,
    totalAccountBalance,
    monthlyPredictionAggregates,
  } = useDashboardData();

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="animate-enter space-y-1">
        <p className="text-sm font-medium leading-relaxed text-foreground/75">
          Visão geral das finanças familiares com base nos lançamentos do mês.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !error ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Atualizando dados do dashboard...
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:items-stretch">
        <SummaryCards
          loading={loading}
          monthSummary={monthSummary}
          totalAccountBalance={totalAccountBalance}
          sparklines={sparklines}
        />

        <ExpenseCategories
          loading={loading}
          categories={expenseCategories}
          monthLabel={monthSummary.monthLabel}
          monthKey={monthSummary.monthKey}
          yearSharePercent={yearExpenseSharePercent}
        />
      </section>

      <PredictionSummary
        loading={loading}
        aggregates={monthlyPredictionAggregates}
        monthKey={monthSummary.monthKey}
        monthLabel={monthSummary.monthLabel}
      />

      <CashflowChart
        loading={loading}
        data={dailyCashflow}
        monthLabel={monthSummary.monthLabel}
        totalIncome={monthSummary.income}
        totalExpense={monthSummary.expense}
      />

      <ExpenseBreakdownBars
        loading={loading}
        categories={expenseCategories}
        monthLabel={monthSummary.monthLabel}
        monthKey={monthSummary.monthKey}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] xl:items-stretch">
        <MemberParticipationRow
          loading={loading}
          participation={memberParticipation}
          monthLabel={monthSummary.monthLabel}
          hasActiveFamily={Boolean(activeFamily)}
          totalExpense={monthSummary.expense}
        />

        <RecentTransactions
          loading={loading}
          transactions={recentTransactions}
          monthKey={monthSummary.monthKey}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2 xl:items-stretch">
        <GoalsHighlight />
        <FamilyOverview
          loading={loading}
          members={memberStats}
          monthLabel={monthSummary.monthLabel}
          hasActiveFamily={Boolean(activeFamily)}
        />
      </section>
    </div>
  );
}
