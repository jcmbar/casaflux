"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Target } from "lucide-react";

import { GoalProgressBadge } from "@/components/finance/goals/goal-progress-badge";
import { DashboardPanelHeader } from "@/components/finance/dashboard/dashboard-panel-header";
import { DashboardPanel } from "@/components/finance/dashboard/dashboard-panel";
import { CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAppContext } from "@/contexts/app-context";
import {
  filterAccountsByFinanceScope,
  getFinanceViewScope,
} from "@/lib/finance/finance-scope";
import {
  getGoalCurrentAmount,
  getGoalProgressPercent,
} from "@/lib/finance/goal-progress";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { getGoalScope } from "@/types/budget";
import type { Account } from "@/types/account";
import {
  enrichGoalWithScopedAccount,
  GOALS_SELECT,
  mapFinancialGoal,
  type FinancialGoalRow,
  type Goal,
} from "@/types/goal";

export function GoalsHighlight() {
  const supabase = useMemo(() => createClient(), []);
  const { user, activeFamily } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);

  const scope = useMemo(
    () =>
      user
        ? getGoalScope({
            activeFamilyId: activeFamily?.id ?? null,
            userId: user.id,
          })
        : null,
    [activeFamily?.id, user],
  );

  const financeScope = useMemo(
    () =>
      user
        ? getFinanceViewScope({
            userId: user.id,
            activeFamilyId: activeFamily?.id ?? null,
          })
        : null,
    [activeFamily?.id, user],
  );

  const loadGoals = useCallback(async () => {
    if (!scope || !financeScope) {
      setGoals([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [accountsRes, goalsRes] = await Promise.all([
      supabase.from("accounts").select("*").order("name"),
      (() => {
        let query = supabase
          .from("financial_goals")
          .select(GOALS_SELECT)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(3);

        query = scope.familyId
          ? query.eq("family_id", scope.familyId)
          : query.eq("owner_user_id", scope.ownerUserId!);

        return query;
      })(),
    ]);

    if (goalsRes.error) {
      console.error(goalsRes.error);
      setGoals([]);
      setLoading(false);
      return;
    }

    if (accountsRes.error) {
      console.error(accountsRes.error);
    }

    const scopedAccounts = filterAccountsByFinanceScope(
      (accountsRes.data ?? []) as Account[],
      financeScope,
    );

    setGoals(
      ((goalsRes.data ?? []) as FinancialGoalRow[])
        .map(mapFinancialGoal)
        .map((goal) => enrichGoalWithScopedAccount(goal, scopedAccounts)),
    );

    setLoading(false);
  }, [financeScope, scope, supabase]);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  return (
    <DashboardPanel delayMs={220}>
      <DashboardPanelHeader
        title="Metas em destaque"
        action={
          <Link
            href="/metas"
            className="text-sm font-medium text-primary hover:underline"
          >
            Ver todas
          </Link>
        }
      />

      <CardContent className="space-y-5 pt-0">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando metas...
          </div>
        ) : goals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Target className="size-5" />
            </div>
            <p className="text-sm font-medium">Nenhuma meta ativa</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre objetivos financeiros para acompanhar o progresso aqui.
            </p>
            <Link
              href="/metas"
              className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
            >
              Criar meta
            </Link>
          </div>
        ) : (
          goals.map((goal) => {
            const currentAmount = getGoalCurrentAmount(goal);
            const progress = getGoalProgressPercent(goal);

            return (
              <div
                key={goal.id}
                className="space-y-2.5"
                data-testid="goal-highlight-item"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <p className="font-medium">{goal.name}</p>
                    <GoalProgressBadge goal={goal} />
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {formatCurrency(currentAmount)} de{" "}
                      {formatCurrency(goal.targetAmount)}
                    </p>
                  </div>
                  <span
                    className="text-sm font-medium text-primary tabular-nums"
                    data-testid="goal-progress-percent"
                  >
                    {progress}%
                  </span>
                </div>

                <Progress
                  value={progress}
                  className="gap-0 [&_[data-slot=progress-indicator]]:bg-primary [&_[data-slot=progress-track]]:h-2"
                />
              </div>
            );
          })
        )}
      </CardContent>
    </DashboardPanel>
  );
}
