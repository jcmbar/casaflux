"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { UpcomingStatementDues } from "@/components/finance/dashboard/upcoming-bills";
import { useDashboardData } from "@/components/finance/dashboard/use-dashboard-data";
import { useAppContext } from "@/contexts/app-context";
import {
  getHideAmounts,
  setHideAmounts,
} from "@/lib/finance/user-ui-preferences";

export function DashboardView() {
  const { user, activeFamily } = useAppContext();
  const [hideAmounts, setHideAmountsState] = useState(false);
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
    monthlyProjectionDelta,
    upcomingStatementDues,
  } = useDashboardData();

  useEffect(() => {
    if (!user?.id) {
      setHideAmountsState(false);
      return;
    }
    setHideAmountsState(getHideAmounts(user.id));
  }, [user?.id]);

  function toggleHideAmounts() {
    if (!user?.id) return;
    const next = !hideAmounts;
    setHideAmounts(user.id, next);
    setHideAmountsState(next);
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="animate-enter flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-relaxed text-foreground/75">
          Visão geral das finanças familiares com base nos lançamentos do mês.
        </p>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={toggleHideAmounts}
          aria-label={hideAmounts ? "Mostrar valores" : "Ocultar valores"}
          data-testid="dashboard-toggle-hide-amounts"
        >
          {hideAmounts ? (
            <EyeOff className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
        </Button>
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
          monthlyProjectionDelta={monthlyProjectionDelta}
          sparklines={sparklines}
          hideAmounts={hideAmounts}
        />

        <ExpenseCategories
          loading={loading}
          categories={expenseCategories}
          monthLabel={monthSummary.monthLabel}
          monthKey={monthSummary.monthKey}
          yearSharePercent={yearExpenseSharePercent}
          hideAmounts={hideAmounts}
        />
      </section>

      <PredictionSummary
        loading={loading}
        aggregates={monthlyPredictionAggregates}
        monthKey={monthSummary.monthKey}
        monthLabel={monthSummary.monthLabel}
        hideAmounts={hideAmounts}
      />

      <UpcomingStatementDues
        loading={loading}
        items={upcomingStatementDues}
        className="animate-enter-delayed"
        hideAmounts={hideAmounts}
      />

      <CashflowChart
        loading={loading}
        data={dailyCashflow}
        monthLabel={monthSummary.monthLabel}
        totalIncome={monthSummary.income}
        totalExpense={monthSummary.expense}
        hideAmounts={hideAmounts}
      />

      <ExpenseBreakdownBars
        loading={loading}
        categories={expenseCategories}
        monthLabel={monthSummary.monthLabel}
        monthKey={monthSummary.monthKey}
        hideAmounts={hideAmounts}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] xl:items-stretch">
        <MemberParticipationRow
          loading={loading}
          participation={memberParticipation}
          monthLabel={monthSummary.monthLabel}
          hasActiveFamily={Boolean(activeFamily)}
          totalExpense={monthSummary.expense}
          hideAmounts={hideAmounts}
        />

        <RecentTransactions
          loading={loading}
          transactions={recentTransactions}
          monthKey={monthSummary.monthKey}
          hideAmounts={hideAmounts}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2 xl:items-stretch">
        <GoalsHighlight hideAmounts={hideAmounts} />
        <FamilyOverview
          loading={loading}
          members={memberStats}
          monthLabel={monthSummary.monthLabel}
          hasActiveFamily={Boolean(activeFamily)}
          hideAmounts={hideAmounts}
        />
      </section>
    </div>
  );
}
