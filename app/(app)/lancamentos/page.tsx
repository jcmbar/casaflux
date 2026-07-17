"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FormInput,
  FormSelect,
} from "@/components/forms/form-controls";
import { PageIntro } from "@/components/layout/page-intro";
import { useConfirm } from "@/components/feedback/confirm-dialog-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppContext } from "@/contexts/app-context";
import { PeriodFilterBar } from "@/components/finance/period-filter-bar";
import {
  filterTransactionsByPeriod,
  parsePeriodFromSearchParams,
  type PeriodFilter,
} from "@/lib/finance/period-filter";
import {
  filterAccountsByFinanceScope,
  getFinanceViewScope,
  getScopedAccountIds,
} from "@/lib/finance/finance-scope";
import {
  adjustAccountBalance,
  getTransactionBalanceDelta,
} from "@/lib/finance/account-balance";
import { createTransaction } from "@/lib/finance/create-transaction";
import { CATEGORIES_CHANGED_EVENT } from "@/lib/finance/category-events";
import {
  fetchHiddenSystemCategoryIds,
  filterActiveCategories,
  getSelectableCategories,
  type CategoryVisibilityContext,
} from "@/lib/finance/active-categories";
import { sumByType } from "@/lib/finance/dashboard-stats";
import { TRANSACTIONS_SELECT } from "@/lib/finance/transactions-query";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { canPostToAccount, type Account } from "@/types/account";
import {
  mapTransaction,
  type Transaction,
  type TransactionRow,
  type TransactionType,
} from "@/types/transaction";

type Category = {
  id: string;
  name: string;
  type: TransactionType;
  color: string | null;
  icon: string | null;
  owner_user_id?: string | null;
  is_active?: boolean;
};

type FormState = {
  description: string;
  amount: string;
  type: TransactionType;
  categoryId: string;
  accountId: string;
  date: string;
};

const typeMap = {
  income: {
    label: "Receita",
    icon: ArrowUpRight,
    badgeClass: "border-primary/25 bg-primary/5 text-primary",
    valueClass: "text-primary",
    iconClass: "bg-primary/10 text-primary",
  },
  expense: {
    label: "Despesa",
    icon: ArrowDownLeft,
    badgeClass: "border-destructive/25 bg-destructive/5 text-destructive",
    valueClass: "text-destructive",
    iconClass: "bg-destructive/10 text-destructive",
  },
  transfer: {
    label: "Transferência",
    icon: ArrowRightLeft,
    badgeClass: "border-border bg-muted/60 text-foreground",
    valueClass: "text-muted-foreground",
    iconClass: "bg-muted text-muted-foreground",
  },
} as const;

function getDefaultCategoryId(type: TransactionType, categories: Category[]) {
  const match =
    categories.find((category) => category.type === type) ?? categories[0];

  return match?.id ?? "";
}

function buildLancamentosUrl(period: PeriodFilter, extraParams?: Record<string, string>) {
  const params = new URLSearchParams();

  if (period.mode === "all") {
    params.set("period", "all");
  } else {
    params.set("month", period.monthKey);
  }

  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `/lancamentos?${query}` : "/lancamentos";
}

function LancamentosPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient()!, []);
  const confirm = useConfirm();
  const { user, activeFamily, isFamilyAdmin } = useAppContext();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryVisibility, setCategoryVisibility] =
    useState<CategoryVisibilityContext>({
      hiddenSystemCategoryIds: new Set(),
    });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodFilter>(() =>
    parsePeriodFromSearchParams(searchParams),
  );
  const [form, setForm] = useState<FormState>({
    description: "",
    amount: "",
    type: "expense",
    categoryId: "",
    accountId: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const scope = useMemo(
    () =>
      user
        ? getFinanceViewScope({
            userId: user.id,
            activeFamilyId: activeFamily?.id ?? null,
          })
        : null,
    [activeFamily?.id, user],
  );

  const postableAccounts = useMemo(() => {
    if (!user) return [];

    return accounts.filter((account) => canPostToAccount(account, user.id));
  }, [accounts, user]);

  async function loadData() {
    if (!scope) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const [accountsRes, categoriesRes, hiddenSystemCategoryIds] =
      await Promise.all([
      supabase.from("accounts").select("*").order("name"),
      supabase.from("categories").select("*").order("name"),
      user
        ? fetchHiddenSystemCategoryIds(supabase, user.id)
        : Promise.resolve(new Set<string>()),
    ]);

    if (accountsRes.error) {
      console.error(accountsRes.error);
    }

    if (categoriesRes.error) {
      console.error(categoriesRes.error);
    }

    const scopedAccounts = filterAccountsByFinanceScope(
      (accountsRes.data ?? []) as Account[],
      scope,
    );
    const scopedAccountIds = getScopedAccountIds(
      (accountsRes.data ?? []) as Account[],
      scope,
    );

    let transactionRows: TransactionRow[] = [];

    if (scopedAccountIds.length > 0) {
      const transactionsRes = await supabase
        .from("transactions")
        .select(TRANSACTIONS_SELECT)
        .in("account_id", scopedAccountIds)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (transactionsRes.error) {
        console.error(transactionsRes.error);
      } else {
        transactionRows = (transactionsRes.data ?? []) as TransactionRow[];
      }
    }

    setAccounts(scopedAccounts);

    const visibility: CategoryVisibilityContext = {
      hiddenSystemCategoryIds,
    };
    const normalizedCategories = ((categoriesRes.data ?? []) as Category[]).map(
      (category) => ({
        ...category,
        owner_user_id: category.owner_user_id ?? null,
        is_active: category.is_active ?? true,
      }),
    );

    if (categoriesRes.error) {
      console.error(categoriesRes.error);
    } else {
      setCategories(normalizedCategories);
    }

    setCategoryVisibility(visibility);

    setTransactions(transactionRows.map((row) => mapTransaction(row)));

    const activeCategories = filterActiveCategories(
      normalizedCategories,
      visibility,
    );
    const loadedPostable = scopedAccounts.filter((account) =>
      user ? canPostToAccount(account, user.id) : false,
    );

    setForm((current) => ({
      ...current,
      categoryId:
        current.categoryId ||
        getDefaultCategoryId(current.type, activeCategories),
      accountId: current.accountId || loadedPostable[0]?.id || "",
    }));

    setLoading(false);
  }

  useEffect(() => {
    if (scope) {
      void loadData();
    }
  }, [scope]);

  useEffect(() => {
    function handleTransactionsChanged() {
      if (scope) {
        void loadData();
      }
    }

    window.addEventListener("casaflux:transactions-changed", handleTransactionsChanged);
    return () => {
      window.removeEventListener(
        "casaflux:transactions-changed",
        handleTransactionsChanged,
      );
    };
  }, [scope]);

  useEffect(() => {
    function handleCategoriesChanged() {
      if (scope) {
        void loadData();
      }
    }

    window.addEventListener(CATEGORIES_CHANGED_EVENT, handleCategoriesChanged);
    return () => {
      window.removeEventListener(
        CATEGORIES_CHANGED_EVENT,
        handleCategoriesChanged,
      );
    };
  }, [scope]);

  useEffect(() => {
    setPeriod(parsePeriodFromSearchParams(searchParams));
  }, [searchParams]);

  function updatePeriod(nextPeriod: PeriodFilter) {
    setPeriod(nextPeriod);
    router.replace(buildLancamentosUrl(nextPeriod), { scroll: false });
  }

  const filteredTransactions = useMemo(
    () => filterTransactionsByPeriod(transactions, period),
    [transactions, period],
  );

  const incomes = useMemo(
    () => sumByType(filteredTransactions, "income"),
    [filteredTransactions],
  );

  const expenses = useMemo(
    () => sumByType(filteredTransactions, "expense"),
    [filteredTransactions],
  );

  const balance = incomes - expenses;
  const summaryScopeLabel =
    period.mode === "all" ? "total" : "do mês";
  const listTitle =
    period.mode === "all" ? "Todo o histórico" : "Lançamentos do mês";
  const isEditing = editingId !== null;
  const openedFromQuery = useRef(false);

  const normalizedCategories = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        owner_user_id: category.owner_user_id ?? null,
        is_active: category.is_active ?? true,
      })),
    [categories],
  );

  const activeCategories = useMemo(
    () => filterActiveCategories(normalizedCategories, categoryVisibility),
    [categoryVisibility, normalizedCategories],
  );

  const selectableFormCategories = useMemo(
    () =>
      getSelectableCategories(normalizedCategories, categoryVisibility, {
        includeCategoryId: form.categoryId || null,
      }).filter((category) => category.type === form.type),
    [categoryVisibility, form.categoryId, form.type, normalizedCategories],
  );

  function resetForm() {
    setEditingId(null);
    setForm({
      description: "",
      amount: "",
      type: "expense",
      categoryId: getDefaultCategoryId("expense", activeCategories),
      accountId: postableAccounts[0]?.id ?? "",
      date: new Date().toISOString().slice(0, 10),
    });
  }

  function handleOpenNew() {
    resetForm();
    setOpen(true);
  }

  useEffect(() => {
    if (
      searchParams.get("new") !== "1" ||
      loading ||
      openedFromQuery.current
    ) {
      return;
    }

    openedFromQuery.current = true;
    handleOpenNew();
    router.replace(buildLancamentosUrl(period), { scroll: false });
  }, [loading, period, router, searchParams]);

  function handleTypeChange(type: TransactionType) {
    setForm((current) => ({
      ...current,
      type,
      categoryId: getDefaultCategoryId(type, activeCategories),
    }));
  }

  function handleEdit(transaction: Transaction) {
    setEditingId(transaction.id);
    setForm({
      description: transaction.description,
      amount: String(transaction.amount),
      type: transaction.type,
      categoryId: transaction.categoryId ?? "",
      accountId: transaction.accountId,
      date: transaction.date,
    });
    setOpen(true);
  }

  async function refreshTransactions() {
    const { data, error } = await supabase
      .from("transactions")
      .select(TRANSACTIONS_SELECT)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setTransactions(
      (data ?? []).map((row) => mapTransaction(row as TransactionRow)),
    );
  }

  function canManageTransaction(transaction: Transaction) {
    if (!user) return false;

    const account = accounts.find((item) => item.id === transaction.accountId);
    if (!account) return false;

    if (!account.is_family_shared) {
      return transaction.createdBy === user.id;
    }

    return (
      transaction.createdBy === user.id ||
      isFamilyAdmin ||
      account.allow_family_edit
    );
  }

  async function handleDelete(transaction: Transaction) {
    if (!canManageTransaction(transaction)) {
      toast.error("Você não tem permissão para excluir este lançamento.");
      return;
    }

    const confirmed = await confirm({
      title: "Excluir lançamento",
      description: `Excluir o lançamento "${transaction.description}"? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      destructive: true,
    });

    if (!confirmed) return;

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", transaction.id);

    if (error) {
      console.error(error);
      toast.error("Não foi possível excluir o lançamento.");
      return;
    }

    try {
      await adjustAccountBalance(supabase, {
        accountId: transaction.accountId,
        delta: -getTransactionBalanceDelta(transaction.type, transaction.amount),
      });
    } catch (balanceError) {
      console.error(balanceError);
    }

    await loadData();
    toast.success("Lançamento excluído.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) return;

    const parsedAmount = Number(form.amount.replace(",", "."));

    if (!form.description.trim() || !parsedAmount || parsedAmount <= 0) {
      return;
    }

    const selectedAccount = accounts.find(
      (account) => account.id === form.accountId,
    );

    if (
      !selectedAccount ||
      !canPostToAccount(selectedAccount, user.id)
    ) {
      toast.error("Você não tem permissão para lançar nesta conta.");
      return;
    }

    setSaving(true);

    const payload = {
      description: form.description.trim(),
      amount: parsedAmount,
      type: form.type,
      category_id: form.categoryId || null,
      account_id: form.accountId,
      transaction_date: form.date,
      created_by: user.id,
      family_id: selectedAccount.family_id,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("transactions")
        .update({
          description: payload.description,
          amount: payload.amount,
          type: payload.type,
          category_id: payload.category_id,
          account_id: payload.account_id,
          transaction_date: payload.transaction_date,
        })
        .eq("id", editingId);

      if (error) {
        console.error(error);
        toast.error("Não foi possível atualizar o lançamento.");
        setSaving(false);
        return;
      }
    } else {
      const result = await createTransaction(supabase, {
        description: payload.description,
        amount: payload.amount,
        type: payload.type,
        categoryId: payload.category_id,
        accountId: payload.account_id,
        transactionDate: payload.transaction_date,
        userId: user.id,
        familyId: selectedAccount.family_id,
      });

      if (!result.ok) {
        toast.error(result.message);
        setSaving(false);
        return;
      }
    }

    await loadData();
    resetForm();
    setOpen(false);
    setSaving(false);
    toast.success(isEditing ? "Lançamento atualizado." : "Lançamento salvo.");
  }

  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const accountMap = new Map(accounts.map((item) => [item.id, item]));

  return (
    <div className="space-y-6 md:space-y-8">
      <PageIntro description="Receitas, despesas e transferências." />

      <PeriodFilterBar period={period} onChange={updatePeriod} />

      <div className="flex justify-stretch sm:justify-end">
        <Button
          className="w-full shadow-sm sm:w-auto"
          onClick={handleOpenNew}
          disabled={loading || postableAccounts.length === 0}
          data-testid="new-transaction-button"
        >
          <Plus className="h-4 w-4" />
          Novo lançamento
        </Button>
      </div>

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
              {isEditing ? "Editar lançamento" : "Novo lançamento"}
            </SheetTitle>
            <SheetDescription>
              {isEditing
                ? "Atualize os dados do lançamento selecionado."
                : "Registre uma receita, despesa ou transferência."}
            </SheetDescription>
          </SheetHeader>

          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col"
            data-testid="transaction-form"
          >
            <div className="grid flex-1 gap-5 overflow-y-auto px-6 py-5">
              <FormSelect
                id="type"
                label="Tipo"
                value={form.type}
                onChange={(event) =>
                  handleTypeChange(event.target.value as TransactionType)
                }
              >
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
                <option value="transfer">Transferência</option>
              </FormSelect>

              <FormInput
                id="description"
                label="Descrição"
                type="text"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Ex.: Supermercado, salário, TED..."
                required
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <FormInput
                  id="amount"
                  label="Valor"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  placeholder="0,00"
                  required
                />

                <FormInput
                  id="date"
                  label="Data"
                  type="date"
                  value={form.date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormSelect
                  id="category"
                  label="Categoria"
                  value={form.categoryId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
                >
                  {selectableFormCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </FormSelect>

                <FormSelect
                  id="account"
                  label="Conta"
                  value={form.accountId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      accountId: event.target.value,
                    }))
                  }
                >
                  {postableAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.is_family_shared ? " (familiar)" : " (pessoal)"}
                    </option>
                  ))}
                </FormSelect>
              </div>
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
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="shadow-sm"
                  disabled={saving}
                  data-testid="save-transaction-button"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : isEditing ? (
                    "Salvar alterações"
                  ) : (
                    "Salvar lançamento"
                  )}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Card
        className="animate-enter-delayed border-border/50 shadow-sm"
        data-testid="lancamentos-summary"
        data-ready={loading ? "false" : "true"}
      >
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border/60">
          <div className="space-y-1 sm:px-4 sm:first:pl-0">
            <p className="text-sm text-muted-foreground">
              Receitas {summaryScopeLabel}
            </p>
            <p
              className="text-2xl font-semibold text-primary tabular-nums sm:text-3xl"
              data-testid="lancamentos-income-total"
            >
              {formatCurrency(incomes)}
            </p>
          </div>

          <div className="space-y-1 sm:px-4">
            <p className="text-sm text-muted-foreground">
              Despesas {summaryScopeLabel}
            </p>
            <p
              className="text-2xl font-semibold text-destructive tabular-nums sm:text-3xl"
              data-testid="lancamentos-expense-total"
            >
              {formatCurrency(expenses)}
            </p>
          </div>

          <div className="space-y-1 sm:px-4 sm:last:pr-0">
            <p className="text-sm text-muted-foreground">
              {period.mode === "all" ? "Saldo total" : "Saldo do mês"}
            </p>
            <p
              className={`text-2xl font-semibold tabular-nums sm:text-3xl ${
                balance >= 0 ? "text-primary" : "text-destructive"
              }`}
              data-testid="lancamentos-balance-total"
            >
              {formatCurrency(balance)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="animate-enter-delayed border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="font-semibold">{listTitle}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando lançamentos...
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ArrowRightLeft className="size-5" />
              </div>
              <p className="text-sm font-medium">
                {transactions.length === 0
                  ? "Nenhum lançamento encontrado"
                  : "Nenhum lançamento neste período"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {transactions.length === 0
                  ? "Registre sua primeira movimentação para acompanhar o fluxo."
                  : "Tente outro mês ou veja todo o histórico."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filteredTransactions.map((transaction) => {
                const config = typeMap[transaction.type];
                const Icon = config.icon;
                const account = accountMap.get(transaction.accountId);
                const category = transaction.categoryId
                  ? categoryMap.get(transaction.categoryId)
                  : null;
                const manageable = canManageTransaction(transaction);

                return (
                  <div
                    key={transaction.id}
                    className="group -mx-2 flex flex-col gap-3 rounded-xl px-2 py-4 transition-colors first:pt-2 last:pb-2 hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10 ${config.iconClass}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="font-medium">{transaction.description}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatDate(transaction.date)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
                          <span>{category?.name ?? "Sem categoria"}</span>
                          <span aria-hidden>·</span>
                          <span>{account?.name ?? "Conta"}</span>
                          <span aria-hidden>·</span>
                          <span>
                            {transaction.familyId ? "Compartilhado" : "Pessoal"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:shrink-0 sm:flex-col sm:items-end">
                      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                        <Badge variant="outline" className={config.badgeClass}>
                          {config.label}
                        </Badge>
                        <span
                          className={`text-base font-semibold tabular-nums ${config.valueClass}`}
                        >
                          {transaction.type === "expense" ? "-" : ""}
                          {formatCurrency(transaction.amount)}
                        </span>
                      </div>

                      {manageable ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                                aria-label="Ações"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={() => handleEdit(transaction)}
                            >
                              <Pencil className="h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDelete(transaction)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LancamentosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Carregando lançamentos...
        </div>
      }
    >
      <LancamentosPageContent />
    </Suspense>
  );
}
