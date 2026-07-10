"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, Pencil, Plus, Target, Trash2 } from "lucide-react";

import { GoalProgressBadge } from "@/components/finance/goals/goal-progress-badge";
import { useConfirm } from "@/components/feedback/confirm-dialog-provider";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { PageIntro } from "@/components/layout/page-intro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppContext } from "@/contexts/app-context";
import {
  filterAccountsByFinanceScope,
  getFinanceViewScope,
  isAccountIdInFinanceScope,
} from "@/lib/finance/finance-scope";
import {
  getGoalCurrentAmount,
  getGoalProgressPercent,
} from "@/lib/finance/goal-progress";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import type { Account } from "@/types/account";
import { getGoalScope } from "@/types/budget";
import {
  buildGoalsSummary,
  enrichGoalWithScopedAccount,
  GOALS_SELECT,
  mapFinancialGoal,
  type FinancialGoalRow,
  type Goal,
  type GoalProgressMode,
  type GoalStatus,
} from "@/types/goal";

type GoalFormState = {
  name: string;
  targetAmount: string;
  currentAmount: string;
  deadline: string;
  status: GoalStatus;
  progressMode: GoalProgressMode;
  accountId: string;
};

const statusLabels: Record<GoalStatus, string> = {
  active: "Ativa",
  completed: "Concluída",
  paused: "Pausada",
};

export function MetasView() {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const { user, activeFamily, isFamilyAdmin } = useAppContext();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [scopedAccounts, setScopedAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GoalFormState>({
    name: "",
    targetAmount: "",
    currentAmount: "0",
    deadline: "",
    status: "active",
    progressMode: "manual",
    accountId: "",
  });

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

  const canDeleteGoals = Boolean(
    scope && (scope.familyId ? isFamilyAdmin : true),
  );

  const loadData = useCallback(async () => {
    if (!scope || !financeScope) {
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
          .order("created_at", { ascending: false });

        query = scope.familyId
          ? query.eq("family_id", scope.familyId)
          : query.eq("owner_user_id", scope.ownerUserId!);

        return query;
      })(),
    ]);

    if (accountsRes.error) {
      console.error(accountsRes.error);
    }

    if (goalsRes.error) {
      console.error(goalsRes.error);
      toast.error("Não foi possível carregar as metas.");
      setLoading(false);
      return;
    }

    const accounts = filterAccountsByFinanceScope(
      (accountsRes.data ?? []) as Account[],
      financeScope,
    );
    setScopedAccounts(accounts);

    setGoals(
      ((goalsRes.data ?? []) as FinancialGoalRow[])
        .map(mapFinancialGoal)
        .map((goal) => enrichGoalWithScopedAccount(goal, accounts)),
    );
    setLoading(false);
  }, [financeScope, scope, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => buildGoalsSummary(goals), [goals]);

  function resetForm() {
    setEditingId(null);
    setForm({
      name: "",
      targetAmount: "",
      currentAmount: "0",
      deadline: "",
      status: "active",
      progressMode: "manual",
      accountId: scopedAccounts[0]?.id ?? "",
    });
  }

  function handleOpenNew() {
    resetForm();
    setOpen(true);
  }

  function handleEdit(goal: Goal) {
    setEditingId(goal.id);
    setForm({
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      currentAmount: String(goal.currentAmount),
      deadline: goal.deadline ?? "",
      status: goal.status,
      progressMode: goal.progressMode,
      accountId: goal.accountId ?? scopedAccounts[0]?.id ?? "",
    });
    setOpen(true);
  }

  async function handleDelete(goal: Goal) {
    const confirmed = await confirm({
      title: "Excluir meta",
      description: `Excluir a meta "${goal.name}"?`,
      confirmLabel: "Excluir",
      destructive: true,
    });

    if (!confirmed) return;

    const { error } = await supabase
      .from("financial_goals")
      .delete()
      .eq("id", goal.id);

    if (error) {
      console.error(error);
      toast.error("Não foi possível excluir a meta.");
      return;
    }

    await loadData();
    toast.success("Meta excluída.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!scope || !user || !financeScope) return;

    const parsedTarget = Number(form.targetAmount.replace(",", "."));
    const parsedCurrent = Number(form.currentAmount.replace(",", "."));
    const isAutomatic = form.progressMode === "account_balance";

    if (!form.name.trim()) {
      toast.error("Informe o nome da meta.");
      return;
    }

    if (Number.isNaN(parsedTarget) || parsedTarget <= 0) {
      toast.error("Informe um valor alvo válido.");
      return;
    }

    if (!isAutomatic && (Number.isNaN(parsedCurrent) || parsedCurrent < 0)) {
      toast.error("Informe um valor acumulado válido.");
      return;
    }

    if (isAutomatic && !form.accountId) {
      toast.error("Selecione a conta vinculada.");
      return;
    }

    if (
      isAutomatic &&
      !isAccountIdInFinanceScope(form.accountId, scopedAccounts, financeScope)
    ) {
      toast.error("A conta selecionada não está disponível no contexto atual.");
      return;
    }

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      target_amount: parsedTarget,
      current_amount: isAutomatic ? 0 : parsedCurrent,
      deadline: form.deadline || null,
      status: form.status,
      progress_mode: form.progressMode,
      account_id: isAutomatic ? form.accountId : null,
      family_id: scope.familyId,
      owner_user_id: scope.ownerUserId,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      const { error } = await supabase
        .from("financial_goals")
        .update({
          name: payload.name,
          target_amount: payload.target_amount,
          current_amount: payload.current_amount,
          deadline: payload.deadline,
          status: payload.status,
          progress_mode: payload.progress_mode,
          account_id: payload.account_id,
          updated_at: payload.updated_at,
        })
        .eq("id", editingId);

      if (error) {
        console.error(error);
        toast.error("Não foi possível atualizar a meta.");
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("financial_goals").insert(payload);

      if (error) {
        console.error(error);
        toast.error("Não foi possível criar a meta.");
        setSaving(false);
        return;
      }
    }

    await loadData();
    resetForm();
    setOpen(false);
    setSaving(false);
    toast.success(editingId ? "Meta atualizada." : "Meta criada.");
  }

  const isAutomaticForm = form.progressMode === "account_balance";

  return (
    <div className="space-y-6 md:space-y-8">
      <PageIntro description="Objetivos financeiros com progresso manual ou automático pelo saldo de uma conta do contexto atual." />

      <div className="flex justify-stretch sm:justify-end">
        <Button
          onClick={handleOpenNew}
          className="w-full shadow-sm sm:w-auto"
          data-testid="new-goal-button"
        >
          <Plus className="h-4 w-4" />
          Nova meta
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor planejado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(summary.totalTarget)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor acumulado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-primary tabular-nums">
              {formatCurrency(summary.totalSaved)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Progresso geral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {summary.overallProgress}%
            </p>
          </CardContent>
        </Card>
      </section>

      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetForm();
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editingId ? "Editar meta" : "Nova meta"}</SheetTitle>
            <SheetDescription>
              {isAutomaticForm
                ? "O progresso será calculado automaticamente pelo saldo da conta vinculada."
                : "Informe manualmente o valor acumulado até atingir o objetivo."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="grid flex-1 gap-5 overflow-y-auto px-6 py-5">
              <FormInput
                id="name"
                label="Nome da meta"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />

              <FormSelect
                id="progressMode"
                label="Modo de progresso"
                value={form.progressMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    progressMode: event.target.value as GoalProgressMode,
                  }))
                }
              >
                <option value="manual">Manual</option>
                <option value="account_balance">Saldo da conta</option>
              </FormSelect>

              {isAutomaticForm ? (
                <FormSelect
                  id="accountId"
                  label="Conta vinculada"
                  value={form.accountId}
                  data-testid="goal-account-select"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      accountId: event.target.value,
                    }))
                  }
                  required
                >
                  {scopedAccounts.length === 0 ? (
                    <option value="">Nenhuma conta no contexto atual</option>
                  ) : (
                    scopedAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                        {account.is_family_shared ? " (família)" : " (pessoal)"}
                      </option>
                    ))
                  )}
                </FormSelect>
              ) : null}

              <div className="grid gap-5 sm:grid-cols-2">
                <FormInput
                  id="targetAmount"
                  label="Valor alvo"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.targetAmount}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      targetAmount: event.target.value,
                    }))
                  }
                  required
                />

                {!isAutomaticForm ? (
                  <FormInput
                    id="currentAmount"
                    label="Valor acumulado"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.currentAmount}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        currentAmount: event.target.value,
                      }))
                    }
                    required
                  />
                ) : null}
              </div>

              <FormInput
                id="deadline"
                label="Prazo (opcional)"
                type="date"
                value={form.deadline}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    deadline: event.target.value,
                  }))
                }
              />

              <FormSelect
                id="status"
                label="Status"
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as GoalStatus,
                  }))
                }
              >
                <option value="active">Ativa</option>
                <option value="paused">Pausada</option>
                <option value="completed">Concluída</option>
              </FormSelect>
            </div>

            <SheetFooter>
              <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setOpen(false);
                  }}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="shadow-sm"
                  disabled={saving || (isAutomaticForm && scopedAccounts.length === 0)}
                  data-testid="save-goal-button"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : editingId ? (
                    "Salvar meta"
                  ) : (
                    "Criar meta"
                  )}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando metas...
        </div>
      ) : goals.length === 0 ? (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="py-10 text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Target className="size-5" />
            </div>
            <p className="text-sm font-medium">Nenhuma meta cadastrada</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie objetivos como reserva de emergência ou viagem em família.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {goals.map((goal) => {
            const currentAmount = getGoalCurrentAmount(goal);
            const progress = getGoalProgressPercent(goal);

            return (
              <Card
                key={goal.id}
                className="border-border/50 shadow-sm"
                data-testid="goal-list-item"
              >
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Target className="h-4 w-4" />
                      {goal.name}
                    </CardTitle>

                    <GoalProgressBadge goal={goal} />

                    {goal.deadline ? (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />
                        Prazo: {formatDate(goal.deadline)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{statusLabels[goal.status]}</Badge>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Editar ${goal.name}`}
                      onClick={() => handleEdit(goal)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {canDeleteGoals ? (
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Excluir ${goal.name}`}
                        onClick={() => handleDelete(goal)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Acumulado</p>
                      <p
                        className="text-xl font-semibold tabular-nums"
                        data-testid="goal-current-amount"
                      >
                        {formatCurrency(currentAmount)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Meta</p>
                      <p className="text-xl font-semibold tabular-nums">
                        {formatCurrency(goal.targetAmount)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Progresso</span>
                      <span data-testid="goal-progress-percent">{progress}%</span>
                    </div>

                    <Progress
                      value={progress}
                      className="gap-0 [&_[data-slot=progress-indicator]]:bg-primary [&_[data-slot=progress-track]]:h-2"
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
