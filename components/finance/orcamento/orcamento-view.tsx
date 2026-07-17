"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { useConfirm } from "@/components/feedback/confirm-dialog-provider";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { PeriodFilterBar } from "@/components/finance/period-filter-bar";
import { PageIntro } from "@/components/layout/page-intro";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
  fetchHiddenSystemCategoryIds,
  filterActiveCategories,
  type CategoryVisibilityContext,
} from "@/lib/finance/active-categories";
import { CATEGORIES_CHANGED_EVENT } from "@/lib/finance/category-events";
import {
  buildBudgetCategoryStats,
  buildBudgetSummary,
  mapCategoryBudget,
  type CategoryBudgetRow,
} from "@/lib/finance/budget-stats";
import {
  getDefaultPeriodFilter,
  getPeriodSummaryLabel,
  parsePeriodFromSearchParams,
  type PeriodFilter,
} from "@/lib/finance/period-filter";
import { getFinanceViewScope } from "@/lib/finance/finance-scope";
import { fetchScopedFinanceData } from "@/lib/finance/scoped-finance-data";
import { TRANSACTIONS_SELECT } from "@/lib/finance/transactions-query";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { getBudgetScope } from "@/types/budget";
import type { Category } from "@/types/category";
import {
  mapTransaction,
  type TransactionRow,
} from "@/types/transaction";
import { cn } from "@/lib/utils";

type ExpenseCategory = Pick<
  Category,
  "id" | "name" | "type" | "owner_user_id" | "is_active" | "color" | "icon"
>;

function buildOrcamentoUrl(period: PeriodFilter) {
  return `/orcamento?month=${period.monthKey}`;
}

function OrcamentoPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient()!, []);
  const confirm = useConfirm();
  const { user, activeFamily, isFamilyAdmin } = useAppContext();

  const [period, setPeriod] = useState<PeriodFilter>(() => {
    const parsed = parsePeriodFromSearchParams(searchParams);
    return parsed.mode === "all" ? getDefaultPeriodFilter() : parsed;
  });
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryVisibility, setCategoryVisibility] =
    useState<CategoryVisibilityContext>({
      hiddenSystemCategoryIds: new Set(),
    });
  const [budgetRows, setBudgetRows] = useState<CategoryBudgetRow[]>([]);
  const [transactionRows, setTransactionRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [form, setForm] = useState({
    categoryId: "",
    amountLimit: "",
  });

  const scope = useMemo(
    () =>
      user
        ? getBudgetScope({
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

  const canManageBudgets = Boolean(
    scope &&
      (scope.familyId ? isFamilyAdmin : true),
  );

  const loadData = useCallback(async () => {
    if (!scope || !financeScope) {
      setLoading(false);
      return;
    }

    setLoading(true);

    let budgetsQuery = supabase
      .from("category_budgets")
      .select("*")
      .eq("month_key", period.monthKey);

    budgetsQuery = scope.familyId
      ? budgetsQuery.eq("family_id", scope.familyId)
      : budgetsQuery.eq("owner_user_id", scope.ownerUserId!);

    const [categoriesRes, budgetsRes, scopedData, hiddenSystemCategoryIds] =
      await Promise.all([
      supabase
        .from("categories")
        .select("id, name, type, owner_user_id, is_active")
        .eq("type", "expense")
        .order("name"),
      budgetsQuery,
      fetchScopedFinanceData<TransactionRow>(
        supabase,
        financeScope,
        TRANSACTIONS_SELECT,
      ),
      user
        ? fetchHiddenSystemCategoryIds(supabase, user.id)
        : Promise.resolve(new Set<string>()),
    ]);

    if (categoriesRes.error) {
      console.error(categoriesRes.error);
    } else {
      setCategories(
        ((categoriesRes.data ?? []) as ExpenseCategory[]).map((category) => ({
          ...category,
          type: "expense" as const,
          color: category.color ?? null,
          icon: category.icon ?? null,
          owner_user_id: category.owner_user_id ?? null,
          is_active: category.is_active ?? true,
        })),
      );
    }

    setCategoryVisibility({ hiddenSystemCategoryIds });

    if (budgetsRes.error) {
      console.error(budgetsRes.error);
      toast.error("Não foi possível carregar os limites do orçamento.");
    } else {
      setBudgetRows((budgetsRes.data ?? []) as CategoryBudgetRow[]);
    }

    if (scopedData.accountsError) {
      console.error(scopedData.accountsError);
    }

    if (scopedData.transactionsError) {
      console.error(scopedData.transactionsError);
    } else {
      setTransactionRows(scopedData.transactionRows);
    }

    setLoading(false);
  }, [financeScope, period.monthKey, scope, supabase, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    function handleCategoriesChanged() {
      void loadData();
    }

    window.addEventListener(CATEGORIES_CHANGED_EVENT, handleCategoriesChanged);
    return () => {
      window.removeEventListener(
        CATEGORIES_CHANGED_EVENT,
        handleCategoriesChanged,
      );
    };
  }, [loadData]);

  useEffect(() => {
    const parsed = parsePeriodFromSearchParams(searchParams);
    setPeriod(parsed.mode === "all" ? getDefaultPeriodFilter() : parsed);
  }, [searchParams]);

  function updatePeriod(nextPeriod: PeriodFilter) {
    setPeriod(nextPeriod);
    router.replace(buildOrcamentoUrl(nextPeriod), { scroll: false });
  }

  const transactions = useMemo(
    () => transactionRows.map((row) => mapTransaction(row)),
    [transactionRows],
  );

  const budgets = useMemo(
    () => budgetRows.map((row) => mapCategoryBudget(row)),
    [budgetRows],
  );

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const stats = useMemo(
    () =>
      buildBudgetCategoryStats({
        budgets,
        transactions,
        monthKey: period.monthKey,
        categoryNames,
      }),
    [budgets, transactions, period.monthKey, categoryNames],
  );

  const summary = useMemo(() => buildBudgetSummary(stats), [stats]);

  const activeCategories = useMemo(
    () => filterActiveCategories(categories, categoryVisibility),
    [categories, categoryVisibility],
  );

  const existingCategoryIds = useMemo(
    () => new Set(budgets.map((budget) => budget.categoryId)),
    [budgets],
  );

  const availableCategories = useMemo(
    () =>
      activeCategories.filter(
        (category) => !existingCategoryIds.has(category.id),
      ),
    [activeCategories, existingCategoryIds],
  );

  function resetForm() {
    setEditingBudgetId(null);
    setForm({
      categoryId: availableCategories[0]?.id ?? "",
      amountLimit: "",
    });
  }

  function handleOpenNew() {
    resetForm();
    setOpen(true);
  }

  function handleEdit(stat: (typeof stats)[number]) {
    if (!stat.budgetId) return;

    setEditingBudgetId(stat.budgetId);
    setForm({
      categoryId: stat.categoryId,
      amountLimit: String(stat.limit),
    });
    setOpen(true);
  }

  async function handleDelete(budgetId: string, categoryName: string) {
    const confirmed = await confirm({
      title: "Remover limite",
      description: `Remover o limite de orçamento para ${categoryName}?`,
      confirmLabel: "Remover",
      destructive: true,
    });

    if (!confirmed) return;

    const { error } = await supabase
      .from("category_budgets")
      .delete()
      .eq("id", budgetId);

    if (error) {
      console.error(error);
      toast.error("Não foi possível remover o limite.");
      return;
    }

    await loadData();
    toast.success("Limite removido.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!scope || !canManageBudgets) return;

    const parsedLimit = Number(form.amountLimit.replace(",", "."));

    if (!form.categoryId) {
      toast.error("Selecione uma categoria.");
      return;
    }

    if (Number.isNaN(parsedLimit) || parsedLimit < 0) {
      toast.error("Informe um limite válido.");
      return;
    }

    setSaving(true);

    const payload = {
      category_id: form.categoryId,
      month_key: period.monthKey,
      amount_limit: parsedLimit,
      family_id: scope.familyId,
      owner_user_id: scope.ownerUserId,
      updated_at: new Date().toISOString(),
    };

    if (editingBudgetId) {
      const { error } = await supabase
        .from("category_budgets")
        .update({
          amount_limit: parsedLimit,
          updated_at: payload.updated_at,
        })
        .eq("id", editingBudgetId);

      if (error) {
        console.error(error);
        toast.error("Não foi possível atualizar o limite.");
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("category_budgets").insert(payload);

      if (error) {
        console.error(error);
        toast.error("Não foi possível salvar o limite.");
        setSaving(false);
        return;
      }
    }

    await loadData();
    resetForm();
    setOpen(false);
    setSaving(false);
    toast.success(editingBudgetId ? "Limite atualizado." : "Limite definido.");
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageIntro description="Planejamento mensal por categoria. O utilizado considera despesas das contas pessoais e da família ativa." />

      <PeriodFilterBar
        period={period}
        onChange={updatePeriod}
        allowAll={false}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground capitalize">
          {getPeriodSummaryLabel(period)}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/lancamentos?month=${period.monthKey}`}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-full sm:w-auto",
            )}
          >
            Ver lançamentos do mês
          </Link>
          {canManageBudgets ? (
            <Button
              onClick={handleOpenNew}
              disabled={loading || availableCategories.length === 0}
              className="w-full shadow-sm sm:w-auto"
              data-testid="define-budget-button"
            >
              <Plus className="h-4 w-4" />
              Definir limite
            </Button>
          ) : null}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Limite total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(summary.totalLimit)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Utilizado no mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-2xl font-semibold text-destructive tabular-nums"
              data-testid="orcamento-spent-total"
            >
              {formatCurrency(summary.totalSpentOnBudgeted)}
            </p>
            {summary.totalSpent > summary.totalSpentOnBudgeted ? (
              <p className="mt-1 text-xs text-muted-foreground">
                + {formatCurrency(summary.totalSpent - summary.totalSpentOnBudgeted)}{" "}
                em categorias sem limite
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Disponível
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                summary.totalAvailable >= 0
                  ? "text-primary"
                  : "text-destructive",
              )}
            >
              {formatCurrency(summary.totalAvailable)}
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
            <SheetTitle>
              {editingBudgetId ? "Editar limite" : "Definir limite"}
            </SheetTitle>
            <SheetDescription>
              O gasto é calculado automaticamente a partir das despesas
              lançadas no mês.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="grid flex-1 gap-5 overflow-y-auto px-6 py-5">
              <FormSelect
                id="categoryId"
                label="Categoria"
                value={form.categoryId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    categoryId: event.target.value,
                  }))
                }
                disabled={Boolean(editingBudgetId)}
                required
              >
                {(editingBudgetId ? categories : availableCategories).map(
                  (category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ),
                )}
              </FormSelect>

              <FormInput
                id="amountLimit"
                label="Limite mensal"
                type="number"
                min="0"
                step="0.01"
                value={form.amountLimit}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    amountLimit: event.target.value,
                  }))
                }
                required
              />
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
                  disabled={saving}
                  data-testid="save-budget-button"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : editingBudgetId ? (
                    "Salvar limite"
                  ) : (
                    "Definir limite"
                  )}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Card className="animate-enter-delayed border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="font-semibold">Categorias do mês</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando orçamento...
            </div>
          ) : stats.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
              <p className="text-sm font-medium">Nenhum gasto ou limite neste mês</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Defina limites por categoria ou registre despesas em Lançamentos.
              </p>
            </div>
          ) : (
            stats.map((stat) => {
              const isCritical = stat.hasLimit && stat.percent >= 100;
              const isWarning = stat.hasLimit && stat.percent >= 80 && !isCritical;

              return (
                <div
                  key={stat.categoryId}
                  className="space-y-3 rounded-xl border border-border/50 p-4"
                  data-testid="budget-category-row"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium">{stat.categoryName}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {formatCurrency(stat.spent)}
                        {stat.hasLimit
                          ? ` de ${formatCurrency(stat.limit)}`
                          : " · sem limite definido"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {stat.hasLimit ? (
                        <Badge
                          variant="outline"
                          className={
                            isCritical
                              ? "border-destructive/25 bg-destructive/5 text-destructive"
                              : isWarning
                                ? "border-border bg-muted/60 text-foreground"
                                : "border-primary/25 bg-primary/5 text-primary"
                          }
                        >
                          {stat.percent}% usado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-border/60">
                          Sem limite
                        </Badge>
                      )}

                      {canManageBudgets && stat.budgetId ? (
                        <>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Editar ${stat.categoryName}`}
                            onClick={() => handleEdit(stat)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Remover ${stat.categoryName}`}
                            onClick={() =>
                              handleDelete(stat.budgetId!, stat.categoryName)
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {stat.hasLimit ? (
                    <Progress
                      value={stat.percent}
                      className={cn(
                        "gap-0 [&_[data-slot=progress-track]]:h-2",
                        isCritical
                          ? "[&_[data-slot=progress-indicator]]:bg-destructive"
                          : isWarning
                            ? "[&_[data-slot=progress-indicator]]:bg-muted-foreground"
                            : "[&_[data-slot=progress-indicator]]:bg-primary",
                      )}
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function OrcamentoView() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Carregando orçamento...
        </div>
      }
    >
      <OrcamentoPageContent />
    </Suspense>
  );
}
