"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { CalendarDays, Loader2, Plus } from "lucide-react";

import { CurrencyInput } from "@/components/forms/currency-input";
import { FormInput } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppContext } from "@/contexts/app-context";
import { createTransaction } from "@/lib/finance/create-transaction";
import { CATEGORIES_CHANGED_EVENT, notifyCategoriesChanged } from "@/lib/finance/category-events";
import {
  fetchHiddenSystemCategoryIds,
  filterActiveCategories,
  type CategoryVisibilityContext,
} from "@/lib/finance/active-categories";
import {
  centsToAmount,
  isPositiveCents,
} from "@/lib/finance/currency-input";
import {
  filterAccountsByFinanceScope,
  getFinanceViewScope,
  getScopedAccountIds,
} from "@/lib/finance/finance-scope";
import {
  getDefaultDescriptionForType,
  suggestTransactionDraft,
} from "@/lib/finance/transaction-suggestions";
import { TRANSACTIONS_SELECT } from "@/lib/finance/transactions-query";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { canPostToAccount, type Account } from "@/types/account";
import {
  mapTransaction,
  type Transaction,
  type TransactionRow,
  type TransactionType,
} from "@/types/transaction";

import { useQuickAdd } from "./quick-add-context";

type QuickAddCategory = {
  id: string;
  name: string;
  type: TransactionType;
  owner_user_id: string | null;
  is_active: boolean;
};

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function QuickAddSheet() {
  const supabase = useMemo(() => createClient(), []);
  const { user, activeFamily } = useAppContext();
  const { open, closeQuickAdd } = useQuickAdd();

  const amountRef = useRef<HTMLInputElement>(null);

  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<QuickAddCategory[]>([]);
  const [history, setHistory] = useState<Transaction[]>([]);

  const [type, setType] = useState<TransactionType>("expense");
  const [amountCents, setAmountCents] = useState(0);
  const [description, setDescription] = useState("");
  const [debouncedDescription, setDebouncedDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(getTodayIsoDate);
  const [showDate, setShowDate] = useState(false);
  const [userPickedCategory, setUserPickedCategory] = useState(false);
  const [userPickedAccount, setUserPickedAccount] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

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

  const categoriesForType = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type],
  );

  const today = getTodayIsoDate();
  const isToday = date === today;

  function resetForm() {
    setType("expense");
    setAmountCents(0);
    setDescription("");
    setDebouncedDescription("");
    setCategoryId("");
    setAccountId("");
    setDate(getTodayIsoDate());
    setShowDate(false);
    setUserPickedCategory(false);
    setUserPickedAccount(false);
    setShowNewCategory(false);
    setNewCategoryName("");
  }

  async function loadQuickAddData() {
    if (!scope || !user) return;

    setLoadingData(true);

    const [accountsRes, categoriesRes, hiddenSystemCategoryIds] =
      await Promise.all([
      supabase.from("accounts").select("*").order("name"),
      supabase
        .from("categories")
        .select("id, name, type, owner_user_id, is_active")
        .order("name"),
      fetchHiddenSystemCategoryIds(supabase, user.id),
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
        .order("created_at", { ascending: false })
        .limit(200);

      if (transactionsRes.error) {
        console.error(transactionsRes.error);
      } else {
        transactionRows = (transactionsRes.data ?? []) as TransactionRow[];
      }
    }

    const visibilityContext: CategoryVisibilityContext = {
      hiddenSystemCategoryIds,
    };
    const loadedCategories = ((categoriesRes.data ?? []) as QuickAddCategory[]).map(
      (category) => ({
        ...category,
        is_active: category.is_active ?? true,
      }),
    );

    setAccounts(scopedAccounts);
    setCategories(
      filterActiveCategories(loadedCategories, visibilityContext),
    );
    setHistory(transactionRows.map((row) => mapTransaction(row)));
    setLoadingData(false);
  }

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }

    void loadQuickAddData();

    const timer = window.setTimeout(() => {
      amountRef.current?.focus();
    }, 150);

    return () => window.clearTimeout(timer);
  }, [open, scope, user]);

  useEffect(() => {
    if (!open) return;

    function handleCategoriesChanged() {
      void loadQuickAddData();
    }

    window.addEventListener(CATEGORIES_CHANGED_EVENT, handleCategoriesChanged);
    return () => {
      window.removeEventListener(
        CATEGORIES_CHANGED_EVENT,
        handleCategoriesChanged,
      );
    };
  }, [open, scope, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedDescription(description);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [description]);

  useEffect(() => {
    if (!open || loadingData || !user || postableAccounts.length === 0) return;

    const suggestion = suggestTransactionDraft({
      type,
      description: debouncedDescription,
      categories,
      accounts: postableAccounts,
      history,
      userId: user.id,
    });

    if (!userPickedAccount && suggestion.accountId) {
      setAccountId(suggestion.accountId);
    }

    if (!userPickedCategory && suggestion.categoryId) {
      setCategoryId(suggestion.categoryId);
    }
  }, [
    open,
    loadingData,
    type,
    debouncedDescription,
    categories,
    postableAccounts,
    history,
    user,
    userPickedAccount,
    userPickedCategory,
  ]);

  useEffect(() => {
    if (!open || userPickedCategory) return;

    if (
      categoryId &&
      !categoriesForType.some((category) => category.id === categoryId)
    ) {
      setCategoryId(categoriesForType[0]?.id ?? "");
    }
  }, [open, type, categoryId, categoriesForType, userPickedCategory]);

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType);
    setUserPickedCategory(false);
    setUserPickedAccount(false);
    setShowNewCategory(false);
    setNewCategoryName("");
  }

  function handleCategorySelect(nextCategoryId: string) {
    setUserPickedCategory(true);
    setCategoryId(nextCategoryId);
    setShowNewCategory(false);
    setNewCategoryName("");

    const category = categories.find((item) => item.id === nextCategoryId);
    if (category && !description.trim()) {
      setDescription(category.name);
    }
  }

  function handleAccountSelect(nextAccountId: string) {
    setUserPickedAccount(true);
    setAccountId(nextAccountId);
  }

  async function handleCreateCategory() {
    if (!user) return;

    const name = newCategoryName.trim();
    if (!name) return;

    setCreatingCategory(true);

    const { data, error } = await supabase
      .from("categories")
      .insert({
        name,
        type,
        owner_user_id: user.id,
        is_active: true,
      })
      .select("id, name, type, owner_user_id, is_active")
      .single();

    setCreatingCategory(false);

    if (error || !data) {
      console.error(error);
      toast.error("Não foi possível criar a categoria.");
      return;
    }

    const created = data as QuickAddCategory;
    setCategories((current) =>
      [...current, created].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    );
    setUserPickedCategory(true);
    setCategoryId(created.id);
    if (!description.trim()) {
      setDescription(created.name);
    }
    setShowNewCategory(false);
    setNewCategoryName("");
    notifyCategoriesChanged();
    toast.success("Categoria criada.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) return;

    if (!isPositiveCents(amountCents)) {
      toast.error("Informe um valor válido.");
      return;
    }

    const selectedAccount = postableAccounts.find(
      (account) => account.id === accountId,
    );

    if (!selectedAccount || !canPostToAccount(selectedAccount, user.id)) {
      toast.error("Você não tem permissão para lançar nesta conta.");
      return;
    }

    const trimmedDescription = description.trim();
    const selectedCategory = categories.find((item) => item.id === categoryId);
    const finalDescription =
      trimmedDescription ||
      selectedCategory?.name ||
      getDefaultDescriptionForType(type);

    setSaving(true);

    const result = await createTransaction(supabase, {
      description: finalDescription,
      amount: centsToAmount(amountCents),
      type,
      categoryId: categoryId || null,
      accountId: selectedAccount.id,
      transactionDate: date,
      userId: user.id,
      familyId: selectedAccount.family_id,
    });

    setSaving(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success("Lançamento salvo.");
    closeQuickAdd();
  }

  const canSubmit =
    !loadingData &&
    !saving &&
    postableAccounts.length > 0 &&
    isPositiveCents(amountCents);

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeQuickAdd();
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] rounded-t-2xl px-0 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]"
        data-testid="quick-add-sheet"
      >
        <SheetHeader className="px-5 pb-3 pt-1">
          <SheetTitle>Lançamento rápido</SheetTitle>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5"
          onSubmit={handleSubmit}
        >
          <div className="mb-4 grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant={type === option ? "default" : "outline"}
                className={cn(
                  "h-11",
                  type === option &&
                    option === "expense" &&
                    "bg-destructive text-white hover:bg-destructive/90",
                )}
                onClick={() => handleTypeChange(option)}
              >
                {option === "expense" ? "Despesa" : "Receita"}
              </Button>
            ))}
          </div>

          <label className="mb-4 block space-y-2">
            <span className="text-sm font-medium text-muted-foreground">
              Valor
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">
                R$
              </span>
              <CurrencyInput
                ref={amountRef}
                valueCents={amountCents}
                onValueCentsChange={setAmountCents}
                className="h-14 w-full rounded-xl border border-input bg-surface-sunken/60 pl-11 pr-3 text-2xl font-semibold tracking-tight outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/40"
                data-testid="quick-add-amount"
              />
            </div>
          </label>

          <FormInput
            id="quick-add-description"
            label="Descrição"
            placeholder="Ex.: mercado, salário, aluguel"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            autoComplete="off"
            data-testid="quick-add-description"
          />

          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">Conta</p>
            {loadingData ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Carregando contas…
              </div>
            ) : postableAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma conta disponível para lançamento.
              </p>
            ) : (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {postableAccounts.map((account) => {
                  const selected = account.id === accountId;

                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => handleAccountSelect(account.id)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground hover:bg-muted/60",
                      )}
                      data-testid={`quick-add-account-${account.id}`}
                    >
                      {account.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Categoria</p>
              <Link
                href="/categorias"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => closeQuickAdd()}
              >
                Gerenciar categorias
              </Link>
            </div>

            {showNewCategory ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Nome da categoria"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-surface-sunken/60 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/40"
                  data-testid="quick-add-new-category-name"
                  autoFocus
                />
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0"
                  disabled={creatingCategory || !newCategoryName.trim()}
                  onClick={() => void handleCreateCategory()}
                  data-testid="quick-add-new-category-save"
                >
                  {creatingCategory ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Salvar"
                  )}
                </Button>
              </div>
            ) : null}

            {categoriesForType.length === 0 && !showNewCategory ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma categoria para este tipo.
              </p>
            ) : (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCategory(true);
                    setNewCategoryName("");
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  data-testid="quick-add-new-category"
                >
                  <Plus className="size-3.5" />
                  Nova
                </button>

                {categoriesForType.map((category) => {
                  const selected = category.id === categoryId;

                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => handleCategorySelect(category.id)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground hover:bg-muted/60",
                      )}
                      data-testid={`quick-add-category-${category.id}`}
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pb-2">
            {showDate ? (
              <FormInput
                id="quick-add-date"
                label="Data"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setShowDate(true)}
              >
                <CalendarDays className="size-4" />
                {isToday
                  ? "Hoje · alterar data"
                  : `${formatDate(date, "pt-BR", {
                      day: "2-digit",
                      month: "short",
                    })} · alterar data`}
              </button>
            )}
          </div>

          <SheetFooter className="sticky bottom-0 -mx-5 mt-4 border-t bg-background/95 px-5 py-4 backdrop-blur-sm">
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={!canSubmit}
              data-testid="quick-add-submit"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                "Salvar lançamento"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
