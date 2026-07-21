"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronDown,
  CreditCard,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AccountIdentityMark } from "@/components/finance/account-identity";
import { CreditCardStatementSummary } from "@/components/finance/credit-card-statement-summary";
import { PayInvoiceSheet } from "@/components/finance/pay-invoice-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/forms/currency-input";
import { Label } from "@/components/ui/label";
import {
  FormField,
  FormInput,
  FormSelect,
} from "@/components/forms/form-controls";
import { Input } from "@/components/ui/input";
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
  getMonthKey,
  parsePeriodFromSearchParams,
  type PeriodFilter,
} from "@/lib/finance/period-filter";
import {
  filterAccountsByFinanceScope,
  getFinanceViewScope,
  getScopedAccountIds,
} from "@/lib/finance/finance-scope";
import {
  createAccountTransfer,
  deleteAccountTransfer,
  getTransferEligiblePostableAccounts,
  isLinkedAccountTransfer,
  isTransferInDescription,
  isTransferOutDescription,
  TRANSFER_FLOW_HINT,
  TRANSFER_NEED_ACCOUNTS_MESSAGE,
} from "@/lib/finance/account-transfer";
import { getInvoicePaymentSourceAccounts } from "@/lib/finance/create-invoice-payment";
import {
  adjustAccountBalance,
  getTransactionBalanceDelta,
} from "@/lib/finance/account-balance";
import { createTransaction } from "@/lib/finance/create-transaction";
import { fetchAllTransactionsForAccounts } from "@/lib/finance/fetch-transactions";
import { createRecurrence } from "@/lib/finance/create-recurrence";
import { endRecurrence } from "@/lib/finance/end-recurrence";
import {
  pauseRecurrence,
  resumeRecurrence,
} from "@/lib/finance/pause-recurrence";
import { updateRecurrence } from "@/lib/finance/update-recurrence";
import {
  centsToAmount,
  isPositiveCents,
} from "@/lib/finance/currency-input";
import {
  cancelPrediction,
  createPrediction,
  setPredictionProjection,
  settlePrediction,
  updatePrediction,
} from "@/lib/finance/predictions";
import {
  getPredictionDiff,
  type PredictionDiff,
} from "@/lib/finance/prediction-diff";
import {
  fetchMonthlyPredictionAggregates,
  type MonthlyPredictionAggregates,
} from "@/lib/finance/prediction-aggregates";
import { getRecurrenceEndValidationError } from "@/lib/finance/recurrence-validation";
import {
  RECURRENCE_END_TYPE_LABELS,
  RECURRENCE_END_TYPE_OPTIONS,
  RECURRENCE_FREQUENCY_LABELS,
  RECURRENCE_FREQUENCY_OPTIONS,
} from "@/lib/finance/recurrence-labels";
import { getPendingPredictionRecurrenceOrigin, getRecurrenceRowElementId } from "@/lib/finance/pending-prediction-recurrence-origin";
import {
  formatPendingPredictionUrgencySummary,
  groupPendingPredictionsByUrgency,
} from "@/lib/finance/pending-prediction-urgency";
import {
  RECURRENCE_NAVIGATION_HIGHLIGHT_MS,
  clearRecurrenceHighlightIfCurrent,
  getRecurrenceNavigationHighlightClassName,
  isRecurrenceRowHighlighted,
  nextRecurrenceHighlightId,
} from "@/lib/finance/recurrence-navigation-highlight";
import {
  buildCreateRecurrenceInputFromPredictionForm,
  getPredictionRecurrenceSubmitValidationError,
  shouldCreatePredictionAsRecurrence,
} from "@/lib/finance/prediction-recurrence-submit";
import { setRecurrenceProjection } from "@/lib/finance/set-recurrence-projection";
import { CATEGORIES_CHANGED_EVENT } from "@/lib/finance/category-events";
import {
  fetchHiddenSystemCategoryIds,
  filterActiveCategories,
  getSelectableCategories,
  type CategoryVisibilityContext,
} from "@/lib/finance/active-categories";
import { sumByType } from "@/lib/finance/dashboard-stats";
import { formatAccountSelectLabel } from "@/lib/finance/account-identity";
import {
  getTransactionStatementRelation,
  hasCreditCardBillingConfig,
  STATEMENT_CYCLE_RELATION_LABELS,
} from "@/lib/finance/credit-card-billing";
import {
  filterLancamentosTransactions,
  resolveCardStatementPeriodContext,
} from "@/lib/finance/lancamentos-card-statement";
import {
  ALL_ACCOUNTS_FILTER,
  detectInvoicePaymentSignal,
  getAccountKindLabel,
  getInvoicePaymentLabel,
  getInvoicePaymentReconcileBadge,
  getInvoicePaymentReconcileBadgeClass,
  getInvoicePaymentReconcileBadgeLabel,
  partitionAccountsForFilter,
  resolveAccountFilter,
  type LancamentosAccountFilter,
} from "@/lib/finance/lancamentos-filters";
import {
  applyLancamentosQuickFilters,
  getLancamentosListEmptyCopy,
  LANCAMENTOS_ORIGIN_FILTER_LABELS,
  LANCAMENTOS_ORIGIN_FILTERS,
  LANCAMENTOS_TYPE_FILTER_LABELS,
  LANCAMENTOS_TYPE_FILTERS,
  parseLancamentosOriginFilter,
  parseLancamentosTypeFilter,
  type LancamentosOriginFilter,
  type LancamentosTypeFilter,
} from "@/lib/finance/lancamentos-quick-filters";
import {
  buildTransactionSearchIndex,
  filterTransactionsBySearch,
  LANCAMENTOS_SEARCH_DEBOUNCE_MS,
  normalizeAppliedSearchTerm,
  parseSearchFromSearchParams,
} from "@/lib/finance/lancamentos-search";
import {
  collectImportedTransactionIds,
  getTransactionOriginBadgeClass,
  getTransactionOriginLabel,
  resolveTransactionOrigin,
} from "@/lib/finance/transaction-origin";
import { TRANSACTIONS_SELECT } from "@/lib/finance/transactions-query";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { canPostToAccount, type Account } from "@/types/account";
import { cn } from "@/lib/utils";
import {
  getRecurrenceLifecycleStatus,
  mapTransactionRecurrence,
  RECURRENCE_LIFECYCLE_STATUS_LABELS,
  type RecurrenceEndType,
  type RecurrenceFrequency,
  type TransactionRecurrence,
  type TransactionRecurrenceRow,
} from "@/types/recurrence";
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
  toAccountId: string;
  date: string;
  isRecurring: boolean;
  frequency: RecurrenceFrequency;
  endType: RecurrenceEndType;
  endDate: string;
  occurrencesLimit: string;
  autoConfirm: boolean;
  includeInProjection: boolean;
};

type PredictionFormState = {
  description: string;
  amount: string;
  type: "expense" | "income";
  scheduledDate: string;
  categoryId: string;
  accountId: string;
  includeInProjection: boolean;
  isRecurring: boolean;
  frequency: RecurrenceFrequency;
  endType: RecurrenceEndType;
  endDate: string;
  occurrencesLimit: string;
};

type PendingPrediction = {
  id: string;
  recurrenceId: string | null;
  ownerUserId: string;
  scheduledDate: string;
  amount: number;
  description: string;
  type: "expense" | "income";
  accountId: string | null;
  categoryId: string | null;
  includeInProjection: boolean;
};

type PendingPredictionRow = {
  id: string;
  recurrence_id: string | null;
  owner_user_id: string;
  scheduled_date: string;
  amount: number;
  description: string;
  type: "expense" | "income";
  account_id: string | null;
  category_id: string | null;
  include_in_projection: boolean;
};

const EMPTY_PREDICTION_AGGREGATES: MonthlyPredictionAggregates = {
  predicted: 0,
  realized: 0,
  delta: 0,
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

const frequencyLabels = RECURRENCE_FREQUENCY_LABELS;

function PredictionDiffLine({
  diff,
  note,
  className = "",
}: {
  diff: PredictionDiff;
  note?: string;
  className?: string;
}) {
  if (diff.kind === "equal") {
    return (
      <p className={`text-xs text-muted-foreground ${className}`}>
        Igual ao previsto{note ? ` ${note}` : "."}
      </p>
    );
  }

  const Icon = diff.kind === "above" ? ArrowUpRight : ArrowDownLeft;
  const tone =
    diff.kind === "above"
      ? "text-amber-600 dark:text-amber-400"
      : "text-primary";

  return (
    <p
      className={`flex items-center gap-1 text-xs font-medium ${tone} ${className}`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {formatCurrency(diff.amount)}{" "}
      {diff.kind === "above" ? "acima" : "abaixo"} do previsto
    </p>
  );
}

function SettlementDiffHint({
  predictedAmount,
  amountCents,
}: {
  predictedAmount: number;
  amountCents: number;
}) {
  const isEmpty = amountCents <= 0;
  const diff = getPredictionDiff(
    predictedAmount,
    isEmpty ? predictedAmount : amountCents / 100,
  );

  return (
    <PredictionDiffLine
      diff={diff}
      className="-mt-2"
      note={isEmpty ? "— deixe em branco para usar o valor previsto." : undefined}
    />
  );
}

function amountStringToCents(value: string): number {
  const parsed = Number(value.replace(",", "."));

  if (!Number.isFinite(parsed) || parsed <= 0) return 0;

  return Math.round(parsed * 100);
}

function getDefaultCategoryId(type: TransactionType, categories: Category[]) {
  const match =
    categories.find((category) => category.type === type) ?? categories[0];

  return match?.id ?? "";
}

function buildLancamentosUrl(
  period: PeriodFilter,
  accountFilter: LancamentosAccountFilter = ALL_ACCOUNTS_FILTER,
  searchTerm = "",
  extraParams?: Record<string, string>,
) {
  const params = new URLSearchParams();

  if (period.mode === "all") {
    params.set("period", "all");
  } else {
    params.set("month", period.monthKey);
  }

  if (accountFilter !== ALL_ACCOUNTS_FILTER) {
    params.set("account", accountFilter);
  }

  const normalizedSearch = normalizeAppliedSearchTerm(searchTerm);
  if (normalizedSearch) {
    params.set("search", normalizedSearch);
  }

  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value && value !== "all") {
        params.set(key, value);
      }
    }
  }

  const query = params.toString();
  return query ? `/lancamentos?${query}` : "/lancamentos";
}

function lancamentosFilterParams(input: {
  typeFilter: LancamentosTypeFilter;
  originFilter: LancamentosOriginFilter;
}) {
  return {
    type: input.typeFilter,
    origin: input.originFilter,
  };
}

function LancamentosPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient()!, []);
  const confirm = useConfirm();
  const { user, activeFamily, isFamilyAdmin } = useAppContext();
  const currentMonthKey = useMemo(() => getMonthKey(), []);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [importedTransactionIds, setImportedTransactionIds] = useState<
    Set<string>
  >(() => new Set());
  const [pendingPredictions, setPendingPredictions] = useState<
    PendingPrediction[]
  >([]);
  const [recurrences, setRecurrences] = useState<TransactionRecurrence[]>([]);
  const [recurrencesExpanded, setRecurrencesExpanded] = useState(false);
  const [predictionsExpanded, setPredictionsExpanded] = useState(false);
  const [focusedRecurrenceId, setFocusedRecurrenceId] = useState<string | null>(
    null,
  );
  const [recurrenceFocusNonce, setRecurrenceFocusNonce] = useState(0);
  const [endingRecurrenceId, setEndingRecurrenceId] = useState<string | null>(
    null,
  );
  const [pausingRecurrenceId, setPausingRecurrenceId] = useState<string | null>(
    null,
  );
  const [updatingProjectionId, setUpdatingProjectionId] = useState<
    string | null
  >(null);
  const [monthlyPredictionAggregates, setMonthlyPredictionAggregates] =
    useState<MonthlyPredictionAggregates>(EMPTY_PREDICTION_AGGREGATES);
  const [settledDiffByTransactionId, setSettledDiffByTransactionId] = useState<
    Map<string, PredictionDiff>
  >(new Map());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryVisibility, setCategoryVisibility] =
    useState<CategoryVisibilityContext>({
      hiddenSystemCategoryIds: new Set(),
    });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settlingPredictionId, setSettlingPredictionId] = useState<
    string | null
  >(null);
  const [updatingPredictionProjectionId, setUpdatingPredictionProjectionId] =
    useState<string | null>(null);
  const [settleTarget, setSettleTarget] = useState<PendingPrediction | null>(
    null,
  );
  const [settleForm, setSettleForm] = useState({
    accountId: "",
    date: new Date().toISOString().slice(0, 10),
    amountCents: 0,
  });
  const [settling, setSettling] = useState(false);
  const [payInvoiceOpen, setPayInvoiceOpen] = useState(false);
  const [predictionOpen, setPredictionOpen] = useState(false);
  const [predictionSaving, setPredictionSaving] = useState(false);
  const [editingPredictionId, setEditingPredictionId] = useState<string | null>(
    null,
  );
  const [predictionForm, setPredictionForm] = useState<PredictionFormState>({
    description: "",
    amount: "",
    type: "expense",
    scheduledDate: new Date().toISOString().slice(0, 10),
    categoryId: "",
    accountId: "",
    includeInProjection: true,
    isRecurring: false,
    frequency: "monthly",
    endType: "never",
    endDate: "",
    occurrencesLimit: "",
  });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecurrenceId, setEditingRecurrenceId] = useState<string | null>(
    null,
  );
  const [period, setPeriod] = useState<PeriodFilter>(() =>
    parsePeriodFromSearchParams(searchParams),
  );
  const [accountFilter, setAccountFilter] = useState<LancamentosAccountFilter>(
    () => resolveAccountFilter(searchParams.get("account"), new Set()),
  );
  const [searchTerm, setSearchTerm] = useState(() =>
    parseSearchFromSearchParams(searchParams.get("search")),
  );
  const [appliedSearchTerm, setAppliedSearchTerm] = useState(() =>
    normalizeAppliedSearchTerm(
      parseSearchFromSearchParams(searchParams.get("search")),
    ),
  );
  const [typeFilter, setTypeFilter] = useState<LancamentosTypeFilter>(() =>
    parseLancamentosTypeFilter(searchParams.get("type")),
  );
  const [originFilter, setOriginFilter] = useState<LancamentosOriginFilter>(
    () => parseLancamentosOriginFilter(searchParams.get("origin")),
  );
  const [form, setForm] = useState<FormState>({
    description: "",
    amount: "",
    type: "expense",
    categoryId: "",
    accountId: "",
    toAccountId: "",
    date: new Date().toISOString().slice(0, 10),
    isRecurring: false,
    frequency: "monthly",
    endType: "never",
    endDate: "",
    occurrencesLimit: "",
    autoConfirm: false,
    includeInProjection: true,
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

  const transferEligibleAccounts = useMemo(
    () =>
      user
        ? getTransferEligiblePostableAccounts(accounts, user.id)
        : [],
    [accounts, user],
  );

  const invoicePaymentSourceAccounts = useMemo(
    () =>
      user ? getInvoicePaymentSourceAccounts(accounts, user.id) : [],
    [accounts, user],
  );

  const { bankAccounts, creditCards } = useMemo(
    () => partitionAccountsForFilter(accounts),
    [accounts],
  );

  const accountIds = useMemo(
    () => new Set(accounts.map((account) => account.id)),
    [accounts],
  );

  async function loadData() {
    if (!scope) {
      setMonthlyPredictionAggregates(EMPTY_PREDICTION_AGGREGATES);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [
      accountsRes,
      categoriesRes,
      hiddenSystemCategoryIds,
      monthlyPredictionResult,
    ] =
      await Promise.all([
      supabase.from("accounts").select("*").order("name"),
      supabase.from("categories").select("*").order("name"),
      user
        ? fetchHiddenSystemCategoryIds(supabase, user.id)
        : Promise.resolve(new Set<string>()),
      fetchMonthlyPredictionAggregates(supabase, scope, currentMonthKey),
    ]);

    if (accountsRes.error) {
      console.error(accountsRes.error);
    }

    if (categoriesRes.error) {
      console.error(categoriesRes.error);
    }

    if (monthlyPredictionResult.error) {
      console.error(monthlyPredictionResult.error);
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
    let predictionRows: PendingPredictionRow[] = [];
    const settledDiffs = new Map<string, PredictionDiff>();

    const [predictionsRes, settledRes, recurrencesRes] = await Promise.all([
      supabase
        .from("financial_predictions")
        .select(
          "id, recurrence_id, owner_user_id, scheduled_date, amount, description, type, account_id, category_id, include_in_projection",
        )
        .eq("status", "predicted")
        .order("scheduled_date", { ascending: true }),
      supabase
        .from("financial_predictions")
        .select("amount, settled_amount, settled_transaction_id")
        .eq("status", "settled")
        .not("settled_transaction_id", "is", null),
      supabase
        .from("transaction_recurrences")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
    ]);

    if (scopedAccountIds.length > 0) {
      const transactionsRes = await fetchAllTransactionsForAccounts<TransactionRow>(
        supabase,
        {
          accountIds: scopedAccountIds,
          select: TRANSACTIONS_SELECT,
        },
      );

      if (transactionsRes.error) {
        console.error(transactionsRes.error);
      } else {
        transactionRows = transactionsRes.data;
      }
    }

    let nextImportedIds = new Set<string>();
    if (scopedAccountIds.length > 0) {
      const importRowsRes = await supabase
        .from("import_batch_rows")
        .select("transaction_id, linked_transaction_id")
        .in("account_id", scopedAccountIds);

      if (importRowsRes.error) {
        console.error(importRowsRes.error);
      } else {
        nextImportedIds = collectImportedTransactionIds(
          (importRowsRes.data ?? []) as Array<{
            transaction_id: string | null;
            linked_transaction_id: string | null;
          }>,
        );
      }
    }

    if (predictionsRes.error) {
      console.error(predictionsRes.error);
    } else {
      const scopedIds = new Set(scopedAccountIds);
      predictionRows = (
        (predictionsRes.data ?? []) as PendingPredictionRow[]
      ).filter(
        (row) =>
          row.account_id
            ? scopedIds.has(row.account_id)
            : row.owner_user_id === user?.id,
      );
    }

    if (settledRes.error) {
      console.error(settledRes.error);
    } else {
      for (const row of (settledRes.data ?? []) as {
        amount: number | string;
        settled_amount: number | string | null;
        settled_transaction_id: string | null;
      }[]) {
        if (!row.settled_transaction_id) continue;
        const predicted = Number(row.amount);
        const actual =
          row.settled_amount === null ? predicted : Number(row.settled_amount);
        settledDiffs.set(
          row.settled_transaction_id,
          getPredictionDiff(predicted, actual),
        );
      }
    }

    if (recurrencesRes.error) {
      console.error(recurrencesRes.error);
    } else {
      setRecurrences(
        ((recurrencesRes.data ?? []) as TransactionRecurrenceRow[])
          .filter((row) =>
            row.family_id
              ? row.family_id === scope.activeFamilyId
              : row.owner_user_id === scope.userId,
          )
          .map((row) => mapTransactionRecurrence(row)),
      );
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
    setImportedTransactionIds(nextImportedIds);
    setSettledDiffByTransactionId(settledDiffs);
    setMonthlyPredictionAggregates(monthlyPredictionResult.aggregates);
    setPendingPredictions(
      predictionRows.map((row) => ({
        id: row.id,
        recurrenceId: row.recurrence_id,
        ownerUserId: row.owner_user_id,
        scheduledDate: row.scheduled_date,
        amount: Number(row.amount),
        description: row.description,
        type: row.type,
        accountId: row.account_id,
        categoryId: row.category_id,
        includeInProjection: row.include_in_projection,
      })),
    );

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
    if (!focusedRecurrenceId || recurrenceFocusNonce === 0) {
      return;
    }

    const targetId = focusedRecurrenceId;
    const timeoutId = window.setTimeout(() => {
      setFocusedRecurrenceId((current) =>
        clearRecurrenceHighlightIfCurrent(current, targetId),
      );
    }, RECURRENCE_NAVIGATION_HIGHLIGHT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [focusedRecurrenceId, recurrenceFocusNonce]);

  useEffect(() => {
    if (
      !focusedRecurrenceId ||
      !recurrencesExpanded ||
      recurrenceFocusNonce === 0
    ) {
      return;
    }

    const row = document.getElementById(
      getRecurrenceRowElementId(focusedRecurrenceId),
    );
    row?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (row instanceof HTMLElement) {
      row.focus({ preventScroll: true });
    }
  }, [focusedRecurrenceId, recurrencesExpanded, recurrenceFocusNonce]);

  useEffect(() => {
    function handleTransactionsChanged() {
      if (scope) {
        void loadData();
      }
    }

    window.addEventListener(
      "casaflux:transactions-changed",
      handleTransactionsChanged,
    );
    window.addEventListener(
      "casaflux:recurrences-changed",
      handleTransactionsChanged,
    );
    return () => {
      window.removeEventListener(
        "casaflux:transactions-changed",
        handleTransactionsChanged,
      );
      window.removeEventListener(
        "casaflux:recurrences-changed",
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
    setAccountFilter(
      resolveAccountFilter(searchParams.get("account"), accountIds),
    );
    setTypeFilter(parseLancamentosTypeFilter(searchParams.get("type")));
    setOriginFilter(parseLancamentosOriginFilter(searchParams.get("origin")));

    const fromUrl = parseSearchFromSearchParams(searchParams.get("search"));
    setAppliedSearchTerm((applied) => {
      if (fromUrl === applied) {
        return applied;
      }

      setSearchTerm(fromUrl);
      return fromUrl;
    });
  }, [accountIds, searchParams]);

  const quickFilterParams = useMemo(
    () =>
      lancamentosFilterParams({
        typeFilter,
        originFilter,
      }),
    [originFilter, typeFilter],
  );

  function updatePeriod(nextPeriod: PeriodFilter) {
    setPeriod(nextPeriod);
    router.replace(
      buildLancamentosUrl(
        nextPeriod,
        accountFilter,
        appliedSearchTerm,
        quickFilterParams,
      ),
      { scroll: false },
    );
  }

  function updateAccountFilter(nextFilter: LancamentosAccountFilter) {
    setAccountFilter(nextFilter);
    router.replace(
      buildLancamentosUrl(
        period,
        nextFilter,
        appliedSearchTerm,
        quickFilterParams,
      ),
      { scroll: false },
    );
  }

  function applySearchTerm(rawTerm: string = searchTerm) {
    const next = normalizeAppliedSearchTerm(rawTerm);
    setSearchTerm(rawTerm);
    setAppliedSearchTerm(next);
    router.replace(
      buildLancamentosUrl(period, accountFilter, next, quickFilterParams),
      {
        scroll: false,
      },
    );
  }

  function clearSearchTerm() {
    setSearchTerm("");
    setAppliedSearchTerm("");
    router.replace(
      buildLancamentosUrl(period, accountFilter, "", quickFilterParams),
      {
        scroll: false,
      },
    );
  }

  function updateTypeFilter(next: LancamentosTypeFilter) {
    setTypeFilter(next);
    router.replace(
      buildLancamentosUrl(
        period,
        accountFilter,
        appliedSearchTerm,
        lancamentosFilterParams({ typeFilter: next, originFilter }),
      ),
      { scroll: false },
    );
  }

  function updateOriginFilter(next: LancamentosOriginFilter) {
    setOriginFilter(next);
    router.replace(
      buildLancamentosUrl(
        period,
        accountFilter,
        appliedSearchTerm,
        lancamentosFilterParams({ typeFilter, originFilter: next }),
      ),
      { scroll: false },
    );
  }

  useEffect(() => {
    const next = normalizeAppliedSearchTerm(searchTerm);
    if (next === appliedSearchTerm) {
      return;
    }

    const timer = window.setTimeout(() => {
      setAppliedSearchTerm(next);
      router.replace(
        buildLancamentosUrl(period, accountFilter, next, quickFilterParams),
        {
          scroll: false,
        },
      );
    }, LANCAMENTOS_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [
    accountFilter,
    appliedSearchTerm,
    period,
    quickFilterParams,
    router,
    searchTerm,
  ]);

  const searchLookups = useMemo(
    () => ({
      categoriesById: new Map(
        categories.map((category) => [
          category.id,
          { id: category.id, name: category.name },
        ]),
      ),
      accountsById: new Map(
        accounts.map((account) => [
          account.id,
          {
            id: account.id,
            name: account.name,
            type: account.type,
          },
        ]),
      ),
    }),
    [accounts, categories],
  );

  const transactionOriginsById = useMemo(() => {
    const map = new Map<
      string,
      ReturnType<typeof resolveTransactionOrigin>
    >();
    for (const transaction of transactions) {
      map.set(
        transaction.id,
        resolveTransactionOrigin(transaction.id, importedTransactionIds),
      );
    }
    return map;
  }, [importedTransactionIds, transactions]);

  const transactionSearchIndex = useMemo(
    () =>
      buildTransactionSearchIndex(
        transactions,
        searchLookups,
        transactionOriginsById,
      ),
    [searchLookups, transactionOriginsById, transactions],
  );

  const selectedAccount =
    accountFilter === ALL_ACCOUNTS_FILTER
      ? null
      : accounts.find((account) => account.id === accountFilter) ?? null;

  const statementReferenceDate = useMemo(
    () => new Date().toISOString().slice(0, 10),
    [],
  );

  const cardStatement = useMemo(
    () =>
      resolveCardStatementPeriodContext({
        account: selectedAccount,
        period,
        transactions,
        referenceDate: statementReferenceDate,
      }),
    [period, selectedAccount, statementReferenceDate, transactions],
  );

  const filteredTransactions = useMemo(() => {
    const byPeriodAndAccount = filterLancamentosTransactions({
      transactions,
      period,
      accountFilter,
      allAccountsFilter: ALL_ACCOUNTS_FILTER,
      cardStatement,
      accounts,
    });
    const byQuickFilters = applyLancamentosQuickFilters({
      transactions: byPeriodAndAccount,
      typeFilter,
      originFilter,
      originsByTransactionId: transactionOriginsById,
    });
    return filterTransactionsBySearch(
      byQuickFilters,
      appliedSearchTerm,
      transactionSearchIndex,
    );
  }, [
    accountFilter,
    accounts,
    appliedSearchTerm,
    cardStatement,
    originFilter,
    period,
    transactionOriginsById,
    transactionSearchIndex,
    transactions,
    typeFilter,
  ]);

  const listEmptyCopy = useMemo(
    () =>
      getLancamentosListEmptyCopy({
        hasLoadedTransactions: transactions.length > 0,
        searchTerm: appliedSearchTerm,
        typeFilter,
        originFilter,
        hasAccountFilter: accountFilter !== ALL_ACCOUNTS_FILTER,
      }),
    [
      accountFilter,
      appliedSearchTerm,
      originFilter,
      transactions.length,
      typeFilter,
    ],
  );

  const transactionById = useMemo(
    () => new Map(transactions.map((item) => [item.id, item])),
    [transactions],
  );

  const visiblePendingPredictions = useMemo(
    () =>
      period.mode === "all"
        ? pendingPredictions
        : pendingPredictions.filter(
            (prediction) =>
              prediction.scheduledDate.slice(0, 7) === period.monthKey,
          ),
    [pendingPredictions, period],
  );

  const pendingPredictionUrgencyGroups = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return groupPendingPredictionsByUrgency(visiblePendingPredictions, today);
  }, [visiblePendingPredictions]);

  const pendingPredictionUrgencySummary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return formatPendingPredictionUrgencySummary(
      visiblePendingPredictions,
      today,
    );
  }, [visiblePendingPredictions]);

  const nextPendingByRecurrence = useMemo(() => {
    const map = new Map<string, PendingPrediction>();
    for (const prediction of pendingPredictions) {
      if (prediction.recurrenceId && !map.has(prediction.recurrenceId)) {
        map.set(prediction.recurrenceId, prediction);
      }
    }
    return map;
  }, [pendingPredictions]);

  const recurrenceById = useMemo(() => {
    const map = new Map(recurrences.map((item) => [item.id, item]));
    return map;
  }, [recurrences]);

  const nextRecurringPrediction =
    pendingPredictions.find((prediction) => {
      if (!prediction.recurrenceId) return false;
      const recurrence = recurrences.find(
        (item) => item.id === prediction.recurrenceId,
      );
      return recurrence != null && !recurrence.isPaused;
    }) ?? null;

  const incomes = useMemo(() => {
    if (cardStatement?.usesStatementCycle) {
      return cardStatement.settlement.paidTotal;
    }
    return sumByType(filteredTransactions, "income");
  }, [cardStatement, filteredTransactions]);

  const expenses = useMemo(() => {
    if (cardStatement?.usesStatementCycle) {
      return cardStatement.settlement.cyclePurchasesTotal;
    }
    return sumByType(filteredTransactions, "expense");
  }, [cardStatement, filteredTransactions]);

  const amountDue = cardStatement?.usesStatementCycle
    ? cardStatement.settlement.amountDueTotal
    : null;
  const balance = incomes - expenses;
  const monthlyPredictionDiff = getPredictionDiff(
    monthlyPredictionAggregates.predicted,
    monthlyPredictionAggregates.realized,
  );
  const showMonthlyPredictionAggregates =
    period.mode === "month" &&
    period.monthKey === currentMonthKey &&
    !cardStatement?.usesStatementCycle;
  const summaryScopeLabel = cardStatement?.usesStatementCycle
    ? "da fatura"
    : period.mode === "all"
      ? "total"
      : "do mês";
  const listTitle =
    accountFilter === ALL_ACCOUNTS_FILTER
      ? period.mode === "all"
        ? "Todo o histórico"
        : "Lançamentos do mês"
      : period.mode === "all"
        ? `Histórico · ${selectedAccount?.name ?? "Conta"}`
        : cardStatement?.usesStatementCycle
          ? `Fatura · ${selectedAccount?.name ?? "Conta"}`
          : `Mês · ${selectedAccount?.name ?? "Conta"}`;
  const isEditing = editingId !== null;
  const isEditingRecurrence = editingRecurrenceId !== null;
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

  const selectablePredictionCategories = useMemo(
    () =>
      getSelectableCategories(normalizedCategories, categoryVisibility, {
        includeCategoryId: predictionForm.categoryId || null,
      }).filter((category) => category.type === predictionForm.type),
    [
      categoryVisibility,
      normalizedCategories,
      predictionForm.categoryId,
      predictionForm.type,
    ],
  );

  function resetPredictionForm() {
    setEditingPredictionId(null);
    setPredictionForm({
      description: "",
      amount: "",
      type: "expense",
      scheduledDate: new Date().toISOString().slice(0, 10),
      categoryId: "",
      accountId: "",
      includeInProjection: true,
      isRecurring: false,
      frequency: "monthly",
      endType: "never",
      endDate: "",
      occurrencesLimit: "",
    });
  }

  function openEditPrediction(prediction: PendingPrediction) {
    if (prediction.recurrenceId) return;

    setEditingPredictionId(prediction.id);
    setPredictionForm({
      description: prediction.description,
      amount: String(prediction.amount),
      type: prediction.type,
      scheduledDate: prediction.scheduledDate,
      categoryId: prediction.categoryId ?? "",
      accountId: prediction.accountId ?? "",
      includeInProjection: prediction.includeInProjection,
      isRecurring: false,
      frequency: "monthly",
      endType: "never",
      endDate: "",
      occurrencesLimit: "",
    });
    setPredictionOpen(true);
  }

  async function handleSavePrediction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || predictionSaving) return;

    const amount = centsToAmount(amountStringToCents(predictionForm.amount));
    const submitInput = {
      isRecurring: predictionForm.isRecurring,
      description: predictionForm.description,
      amount,
      scheduledDate: predictionForm.scheduledDate,
      accountId: predictionForm.accountId,
      categoryId: predictionForm.categoryId || null,
      type: predictionForm.type,
      includeInProjection: predictionForm.includeInProjection,
      frequency: predictionForm.frequency,
      endType: predictionForm.endType,
      endDate: predictionForm.endDate,
      occurrencesLimit: predictionForm.occurrencesLimit,
    };

    const validationError = getPredictionRecurrenceSubmitValidationError(
      submitInput,
      { isEditing: editingPredictionId !== null },
    );

    if (validationError) {
      toast.error(validationError);
      return;
    }

    const selectedAccount = predictionForm.accountId
      ? postableAccounts.find(
          (account) => account.id === predictionForm.accountId,
        )
      : null;

    if (predictionForm.accountId && !selectedAccount) {
      toast.error("Selecione uma conta prevista válida.");
      return;
    }

    setPredictionSaving(true);

    if (
      shouldCreatePredictionAsRecurrence(submitInput, {
        isEditing: editingPredictionId !== null,
      })
    ) {
      const result = await createRecurrence(
        supabase,
        buildCreateRecurrenceInputFromPredictionForm(submitInput, {
          ownerUserId: user.id,
          familyId: selectedAccount!.family_id,
          accountId: selectedAccount!.id,
        }),
      );

      if (!result.ok) {
        toast.error(result.message);
        setPredictionSaving(false);
        return;
      }

      const predictionMonth = predictionForm.scheduledDate.slice(0, 7);
      await loadData();
      resetPredictionForm();
      setPredictionOpen(false);
      setPredictionSaving(false);
      updatePeriod({ mode: "month", monthKey: predictionMonth });
      toast.success(
        result.occurrencesCreated > 0
          ? `Previsão recorrente criada. ${result.occurrencesCreated} ${
              result.occurrencesCreated === 1
                ? "previsão gerada"
                : "previsões geradas"
            }, começando em ${formatDate(predictionForm.scheduledDate)}.`
          : "Previsão recorrente criada.",
      );
      return;
    }

    const sharedInput = {
      familyId: selectedAccount?.family_id ?? null,
      accountId: selectedAccount?.id ?? null,
      categoryId: predictionForm.categoryId || null,
      type: predictionForm.type,
      description: predictionForm.description,
      amount,
      scheduledDate: predictionForm.scheduledDate,
      includeInProjection: predictionForm.includeInProjection,
    };
    const result = editingPredictionId
      ? await updatePrediction(supabase, {
          predictionId: editingPredictionId,
          ...sharedInput,
        })
      : await createPrediction(supabase, {
          ownerUserId: user.id,
          ...sharedInput,
        });

    if (!result.ok) {
      toast.error(result.message);
      setPredictionSaving(false);
      return;
    }

    const predictionMonth = predictionForm.scheduledDate.slice(0, 7);
    await loadData();
    resetPredictionForm();
    setPredictionOpen(false);
    setPredictionSaving(false);
    updatePeriod({ mode: "month", monthKey: predictionMonth });
    toast.success(
      editingPredictionId ? "Previsão atualizada." : "Previsão criada.",
    );
  }

  function resetForm() {
    setEditingId(null);
    setEditingRecurrenceId(null);
    const defaultFrom = transferEligibleAccounts[0]?.id ?? postableAccounts[0]?.id ?? "";
    const defaultTo =
      transferEligibleAccounts.find((account) => account.id !== defaultFrom)?.id ??
      "";
    setForm({
      description: "",
      amount: "",
      type: "expense",
      categoryId: getDefaultCategoryId("expense", activeCategories),
      accountId: postableAccounts[0]?.id ?? "",
      toAccountId: defaultTo,
      date: new Date().toISOString().slice(0, 10),
      isRecurring: false,
      frequency: "monthly",
      endType: "never",
      endDate: "",
      occurrencesLimit: "",
      autoConfirm: false,
      includeInProjection: true,
    });
  }

  function focusRecurrenceOrigin(recurrenceId: string) {
    if (!recurrenceById.has(recurrenceId)) {
      toast.error("Não foi possível encontrar a recorrência de origem.");
      return;
    }

    setRecurrencesExpanded(true);
    setFocusedRecurrenceId((current) =>
      nextRecurrenceHighlightId(current, recurrenceId),
    );
    setRecurrenceFocusNonce((current) => current + 1);
  }

  function openEditRecurrence(recurrence: TransactionRecurrence) {
    setEditingId(null);
    setEditingRecurrenceId(recurrence.id);
    setForm({
      description: recurrence.description,
      amount: String(recurrence.amount),
      type: recurrence.type,
      categoryId: recurrence.categoryId ?? "",
      accountId: recurrence.accountId,
      toAccountId: "",
      date: recurrence.startDate,
      isRecurring: true,
      frequency: recurrence.frequency,
      endType: recurrence.endType,
      endDate: recurrence.endDate ?? "",
      occurrencesLimit:
        recurrence.occurrencesLimit !== null
          ? String(recurrence.occurrencesLimit)
          : "",
      autoConfirm: recurrence.autoConfirm,
      includeInProjection: recurrence.includeInProjection,
    });
    setOpen(true);
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
    router.replace(
      buildLancamentosUrl(
        period,
        accountFilter,
        appliedSearchTerm,
        quickFilterParams,
      ),
      { scroll: false },
    );
  }, [
    accountFilter,
    appliedSearchTerm,
    loading,
    period,
    quickFilterParams,
    router,
    searchParams,
  ]);

  function handleTypeChange(type: TransactionType) {
    setForm((current) => {
      const nextFrom =
        type === "transfer"
          ? transferEligibleAccounts.some((account) => account.id === current.accountId)
            ? current.accountId
            : transferEligibleAccounts[0]?.id ?? ""
          : current.accountId || postableAccounts[0]?.id || "";

      const nextTo =
        type === "transfer"
          ? transferEligibleAccounts.find((account) => account.id !== nextFrom)?.id ??
            ""
          : "";

      return {
        ...current,
        type,
        categoryId:
          type === "transfer"
            ? ""
            : getDefaultCategoryId(type, activeCategories),
        accountId: nextFrom,
        toAccountId: nextTo,
        isRecurring: type === "transfer" ? false : current.isRecurring,
      };
    });
  }

  function handleEdit(transaction: Transaction) {
    if (isLinkedAccountTransfer(transaction)) {
      toast.info(
        "Transferências vinculadas não podem ser editadas nesta versão. Exclua o par e crie novamente.",
      );
      return;
    }

    setEditingRecurrenceId(null);
    setEditingId(transaction.id);
    setForm({
      description: transaction.description,
      amount: String(transaction.amount),
      type: transaction.type,
      categoryId: transaction.categoryId ?? "",
      accountId: transaction.accountId,
      toAccountId: "",
      date: transaction.date,
      isRecurring: false,
      frequency: "monthly",
      endType: "never",
      endDate: "",
      occurrencesLimit: "",
      autoConfirm: false,
      includeInProjection: true,
    });
    setOpen(true);
  }

  async function refreshTransactions() {
    if (!scope) {
      return;
    }

    const scopedAccountIds = getScopedAccountIds(accounts, scope);
    if (scopedAccountIds.length === 0) {
      setTransactions([]);
      return;
    }

    const { data, error } = await fetchAllTransactionsForAccounts<TransactionRow>(
      supabase,
      {
        accountIds: scopedAccountIds,
        select: TRANSACTIONS_SELECT,
      },
    );

    if (error) {
      console.error(error);
      return;
    }

    setTransactions(data.map((row) => mapTransaction(row)));
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

    if (isLinkedAccountTransfer(transaction)) {
      const confirmed = await confirm({
        title: "Excluir transferência",
        description:
          "Isso remove os dois lados da transferência (origem e destino) e reverte os saldos. Essa ação não pode ser desfeita.",
        confirmLabel: "Excluir transferência",
        destructive: true,
      });

      if (!confirmed) return;

      const result = await deleteAccountTransfer(supabase, transaction.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      await loadData();
      toast.success("Transferência excluída.");
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

  function openSettleDialog(prediction: PendingPrediction) {
    if (postableAccounts.length === 0) {
      toast.error("Nenhuma conta disponível para liquidar a previsão.");
      return;
    }

    const predictedAccountIsPostable = postableAccounts.some(
      (account) => account.id === prediction.accountId,
    );

    setSettleForm({
      accountId: predictedAccountIsPostable
        ? prediction.accountId!
        : postableAccounts[0].id,
      date: new Date().toISOString().slice(0, 10),
      amountCents: 0,
    });
    setSettleTarget(prediction);
  }

  function closeSettleDialog() {
    setSettleTarget(null);
    setSettling(false);
  }

  async function handleConfirmSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!settleTarget || settling) return;

    if (!settleForm.accountId || !settleForm.date) {
      toast.error("Informe a conta e a data da liquidação.");
      return;
    }

    setSettling(true);

    const result = await settlePrediction(supabase, {
      predictionId: settleTarget.id,
      accountId: settleForm.accountId,
      settledDate: settleForm.date,
      amount: isPositiveCents(settleForm.amountCents)
        ? centsToAmount(settleForm.amountCents)
        : undefined,
    });

    if (!result.ok) {
      toast.error(result.message);
      setSettling(false);
      return;
    }

    await loadData();
    closeSettleDialog();
    toast.success("Previsão liquidada e lançamento criado.");
  }

  async function handleEndRecurrence(recurrence: TransactionRecurrence) {
    if (endingRecurrenceId || pausingRecurrenceId) return;

    const confirmed = await confirm({
      title: "Encerrar recorrência",
      description: `Encerrar a recorrência "${recurrence.description}"? Novas ocorrências não serão geradas e as previsões pendentes dela serão canceladas. Lançamentos e previsões já liquidadas serão mantidos.`,
      confirmLabel: "Encerrar recorrência",
      destructive: true,
    });

    if (!confirmed) return;

    setEndingRecurrenceId(recurrence.id);
    const result = await endRecurrence(supabase, recurrence.id);

    if (!result.ok) {
      toast.error(result.message);
      setEndingRecurrenceId(null);
      return;
    }

    await loadData();
    setEndingRecurrenceId(null);
    toast.success(
      result.canceledPredictions > 0
        ? `Recorrência encerrada. ${result.canceledPredictions} ${
            result.canceledPredictions === 1
              ? "previsão pendente cancelada"
              : "previsões pendentes canceladas"
          }.`
        : "Recorrência encerrada.",
    );
  }

  async function handlePauseRecurrence(recurrence: TransactionRecurrence) {
    if (endingRecurrenceId || pausingRecurrenceId) return;

    const confirmed = await confirm({
      title: "Pausar recorrência",
      description: `Pausar "${recurrence.description}"? As próximas previsões deixam de ser geradas e as futuras pendentes são canceladas. O passado e o que já foi liquidado permanecem.`,
      confirmLabel: "Pausar recorrência",
    });

    if (!confirmed) return;

    setPausingRecurrenceId(recurrence.id);
    const result = await pauseRecurrence(supabase, recurrence.id);

    if (!result.ok) {
      toast.error(result.message);
      setPausingRecurrenceId(null);
      return;
    }

    await loadData();
    setPausingRecurrenceId(null);
    toast.success(
      result.canceledUpcomingPredictions > 0
        ? `Recorrência pausada. ${result.canceledUpcomingPredictions} ${
            result.canceledUpcomingPredictions === 1
              ? "previsão futura cancelada"
              : "previsões futuras canceladas"
          }.`
        : "Recorrência pausada.",
    );
  }

  async function handleResumeRecurrence(recurrence: TransactionRecurrence) {
    if (endingRecurrenceId || pausingRecurrenceId) return;

    const confirmed = await confirm({
      title: "Retomar recorrência",
      description: `Retomar "${recurrence.description}"? As próximas previsões voltam a ser geradas a partir de agora.`,
      confirmLabel: "Retomar recorrência",
    });

    if (!confirmed) return;

    setPausingRecurrenceId(recurrence.id);
    const result = await resumeRecurrence(supabase, recurrence.id);

    if (!result.ok) {
      toast.error(result.message);
      setPausingRecurrenceId(null);
      return;
    }

    await loadData();
    setPausingRecurrenceId(null);
    toast.success(
      result.createdPredictions > 0
        ? `Recorrência retomada. ${result.createdPredictions} ${
            result.createdPredictions === 1
              ? "próxima previsão gerada"
              : "próximas previsões geradas"
          }.`
        : "Recorrência retomada.",
    );
  }

  async function handleRecurrenceProjectionChange(
    recurrence: TransactionRecurrence,
    includeInProjection: boolean,
  ) {
    if (updatingProjectionId) return;

    setUpdatingProjectionId(recurrence.id);
    const result = await setRecurrenceProjection(
      supabase,
      recurrence.id,
      includeInProjection,
    );

    if (!result.ok) {
      toast.error(result.message);
      setUpdatingProjectionId(null);
      return;
    }

    await loadData();
    setUpdatingProjectionId(null);
    toast.success(
      includeInProjection
        ? "Recorrência incluída no saldo projetado."
        : "Recorrência removida do saldo projetado.",
    );
  }

  async function handleCancelPrediction(prediction: PendingPrediction) {
    if (settlingPredictionId) return;

    const confirmed = await confirm({
      title: "Cancelar previsão",
      description: prediction.recurrenceId
        ? `Cancelar apenas esta ocorrência de "${prediction.description}"? A recorrência continua ativa e nenhum lançamento será criado.`
        : `Cancelar a previsão "${prediction.description}"? Nenhum lançamento será criado.`,
      confirmLabel: "Cancelar previsão",
      destructive: true,
    });

    if (!confirmed) return;

    setSettlingPredictionId(prediction.id);
    const result = await cancelPrediction(supabase, prediction.id);

    if (!result.ok) {
      toast.error(result.message);
      setSettlingPredictionId(null);
      return;
    }

    await loadData();
    setSettlingPredictionId(null);
    toast.success("Previsão cancelada.");
  }

  async function handlePredictionProjectionChange(
    prediction: PendingPrediction,
    includeInProjection: boolean,
  ) {
    if (updatingPredictionProjectionId) return;

    setUpdatingPredictionProjectionId(prediction.id);
    const result = await setPredictionProjection(
      supabase,
      prediction.id,
      includeInProjection,
    );

    if (!result.ok) {
      toast.error(result.message);
      setUpdatingPredictionProjectionId(null);
      return;
    }

    await loadData();
    setUpdatingPredictionProjectionId(null);
    toast.success(
      includeInProjection
        ? "Previsão incluída no saldo projetado."
        : "Previsão removida do saldo projetado.",
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) return;

    const parsedAmount = Number(form.amount.replace(",", "."));
    const isTransfer = form.type === "transfer";

    if ((!isTransfer && !form.description.trim()) || !parsedAmount || parsedAmount <= 0) {
      return;
    }

    if (isTransfer && isEditing) {
      toast.error(
        "Transferências vinculadas não podem ser editadas. Exclua o par e crie novamente.",
      );
      return;
    }

    const parsedOccurrencesLimit = Number(form.occurrencesLimit);
    const recurrenceValidationError =
      isEditingRecurrence || (!isEditing && form.isRecurring)
        ? getRecurrenceEndValidationError({
            startDate: form.date,
            endType: form.endType,
            endDate: form.endDate || null,
            occurrencesLimit:
              form.endType === "occurrences_count"
                ? parsedOccurrencesLimit
                : null,
          })
        : null;

    if (recurrenceValidationError) {
      toast.error(recurrenceValidationError);
      return;
    }

    if (isTransfer) {
      if (transferEligibleAccounts.length < 2) {
        toast.error(TRANSFER_NEED_ACCOUNTS_MESSAGE);
        return;
      }

      setSaving(true);

      const result = await createAccountTransfer(supabase, {
        fromAccountId: form.accountId,
        toAccountId: form.toAccountId,
        amount: parsedAmount,
        transactionDate: form.date,
        description: form.description.trim() || null,
      });

      if (!result.ok) {
        toast.error(result.message);
        setSaving(false);
        return;
      }

      await loadData();
      resetForm();
      setOpen(false);
      setSaving(false);
      toast.success("Transferência registrada.");
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

    if (isEditingRecurrence && editingRecurrenceId) {
      const result = await updateRecurrence(supabase, {
        recurrenceId: editingRecurrenceId,
        description: payload.description,
        amount: payload.amount,
        type: payload.type,
        categoryId: payload.category_id,
        accountId: payload.account_id,
        familyId: selectedAccount.family_id,
        frequency: form.frequency,
        startDate: form.date,
        endType: form.endType,
        endDate: form.endType === "until_date" ? form.endDate : null,
        occurrencesLimit:
          form.endType === "occurrences_count"
            ? parsedOccurrencesLimit
            : null,
        autoConfirm: form.autoConfirm,
        includeInProjection: form.includeInProjection,
      });

      if (!result.ok) {
        toast.error(result.message);
        setSaving(false);
        return;
      }

      await loadData();
      resetForm();
      setOpen(false);
      setSaving(false);

      const syncParts: string[] = [];
      if (result.updatedPredictions > 0) {
        syncParts.push(
          `${result.updatedPredictions} ${
            result.updatedPredictions === 1
              ? "próxima previsão atualizada"
              : "próximas previsões atualizadas"
          }`,
        );
      }
      if (result.canceledPredictions > 0) {
        syncParts.push(
          `${result.canceledPredictions} ${
            result.canceledPredictions === 1
              ? "previsão futura fora da regra cancelada"
              : "previsões futuras fora da regra canceladas"
          }`,
        );
      }
      if (result.createdPredictions > 0) {
        syncParts.push(
          `${result.createdPredictions} ${
            result.createdPredictions === 1
              ? "nova previsão gerada"
              : "novas previsões geradas"
          }`,
        );
      }

      toast.success(
        syncParts.length > 0
          ? `Recorrência atualizada. ${syncParts.join(" · ")}.`
          : "Recorrência atualizada. Próximas previsões já refletem a nova regra.",
      );
      return;
    }

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
    } else if (form.isRecurring) {
      const result = await createRecurrence(supabase, {
        description: payload.description,
        amount: payload.amount,
        type: payload.type,
        categoryId: payload.category_id,
        accountId: payload.account_id,
        ownerUserId: user.id,
        familyId: selectedAccount.family_id,
        frequency: form.frequency,
        startDate: form.date,
        endType: form.endType,
        endDate: form.endType === "until_date" ? form.endDate : null,
        occurrencesLimit:
          form.endType === "occurrences_count"
            ? parsedOccurrencesLimit
            : null,
        autoConfirm: form.autoConfirm,
        includeInProjection: form.includeInProjection,
      });

      if (!result.ok) {
        toast.error(result.message);
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
    toast.success(
      isEditing
        ? "Lançamento atualizado."
        : form.isRecurring
          ? "Recorrência salva."
          : "Lançamento salvo.",
    );
  }

  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const accountMap = new Map(accounts.map((item) => [item.id, item]));

  return (
    <div className="space-y-6 md:space-y-8">
      <PageIntro description="Visão unificada de receitas e despesas de contas bancárias e cartões de crédito." />

      <PeriodFilterBar period={period} onChange={updatePeriod} />

      <div className="animate-enter flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <FormSelect
          id="lancamentos-account-filter"
          label="Conta"
          value={accountFilter}
          onChange={(event) =>
            updateAccountFilter(
              resolveAccountFilter(event.target.value, accountIds),
            )
          }
          className="sm:min-w-64"
          data-testid="lancamentos-account-filter"
        >
          <option value={ALL_ACCOUNTS_FILTER}>Todas as contas</option>
          {bankAccounts.length > 0 ? (
            <optgroup label="Contas">
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountSelectLabel(account, { includeScope: true })}
                </option>
              ))}
            </optgroup>
          ) : null}
          {creditCards.length > 0 ? (
            <optgroup label="Cartões">
              {creditCards.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountSelectLabel(account, { includeScope: true })}
                </option>
              ))}
            </optgroup>
          ) : null}
        </FormSelect>

        <p className="text-xs text-muted-foreground sm:max-w-xs sm:text-right">
          Inclui contas bancárias e cartões. Limpeza em lote:{" "}
          <Link href="/configuracoes" className="underline underline-offset-2">
            Configurações
          </Link>
          .
        </p>
      </div>

      {selectedAccount &&
      selectedAccount.type === "credit_card" &&
      hasCreditCardBillingConfig(selectedAccount) ? (
        <CreditCardStatementSummary
          account={selectedAccount}
          transactions={transactions}
          cycle={cardStatement?.cycle}
          referenceDate={statementReferenceDate}
          className="animate-enter"
          onPayInvoice={() => setPayInvoiceOpen(true)}
          payInvoiceDisabled={invoicePaymentSourceAccounts.length === 0}
        />
      ) : null}

      {selectedAccount &&
      selectedAccount.type === "credit_card" &&
      cardStatement?.cycle &&
      user ? (
        <PayInvoiceSheet
          open={payInvoiceOpen}
          onOpenChange={setPayInvoiceOpen}
          cardAccount={selectedAccount}
          cycle={cardStatement.cycle}
          remainingAmount={cardStatement.settlement.remainingTotal}
          sourceAccounts={invoicePaymentSourceAccounts}
          userId={user.id}
          onSuccess={loadData}
        />
      ) : null}

      <div className="animate-enter rounded-xl border border-border/50 bg-card p-4 shadow-sm">
        <FormField id="lancamentos-search" label="Busca rápida">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              applySearchTerm(searchTerm);
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="lancamentos-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Descrição, categoria, tipo, valor, manual/importado..."
                className="h-10 bg-surface-sunken/60 pr-10 pl-9 dark:bg-input/40"
                data-testid="lancamentos-search-input"
                autoComplete="off"
              />
              {searchTerm ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2"
                  onClick={clearSearchTerm}
                  aria-label="Limpar busca"
                  data-testid="lancamentos-search-clear"
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
            <Button
              type="submit"
              variant="outline"
              className="shrink-0"
              data-testid="lancamentos-search-submit"
            >
              <Search className="size-4" />
              Filtrar
            </Button>
          </form>
        </FormField>

        <div className="mt-3 space-y-2">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filtrar por tipo"
            data-testid="lancamentos-type-filters"
          >
            {LANCAMENTOS_TYPE_FILTERS.map((filter) => {
              const active = typeFilter === filter;
              return (
                <Button
                  key={filter}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  onClick={() => updateTypeFilter(filter)}
                  data-testid={`lancamentos-type-filter-${filter}`}
                >
                  {LANCAMENTOS_TYPE_FILTER_LABELS[filter]}
                </Button>
              );
            })}
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filtrar por origem"
            data-testid="lancamentos-origin-filters"
          >
            {LANCAMENTOS_ORIGIN_FILTERS.map((filter) => {
              const active = originFilter === filter;
              return (
                <Button
                  key={filter}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  onClick={() => updateOriginFilter(filter)}
                  data-testid={`lancamentos-origin-filter-${filter}`}
                >
                  {LANCAMENTOS_ORIGIN_FILTER_LABELS[filter]}
                </Button>
              );
            })}
          </div>
        </div>

        {appliedSearchTerm ||
        typeFilter !== "all" ||
        originFilter !== "all" ? (
          <p
            className="mt-2 text-xs text-muted-foreground"
            data-testid="lancamentos-search-status"
          >
            {filteredTransactions.length}{" "}
            {filteredTransactions.length === 1 ? "resultado" : "resultados"}
            {appliedSearchTerm ? ` · busca “${appliedSearchTerm}”` : ""}
            {typeFilter !== "all"
              ? ` · ${LANCAMENTOS_TYPE_FILTER_LABELS[typeFilter]}`
              : ""}
            {originFilter !== "all"
              ? ` · ${LANCAMENTOS_ORIGIN_FILTER_LABELS[originFilter]}`
              : ""}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2 sm:flex sm:justify-end">
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => {
            resetPredictionForm();
            setPredictionOpen(true);
          }}
          disabled={loading}
          data-testid="new-prediction-button"
        >
          <CalendarPlus className="h-4 w-4" />
          Nova previsão
        </Button>
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
        open={predictionOpen}
        onOpenChange={(nextOpen) => {
          if (predictionSaving) return;
          setPredictionOpen(nextOpen);
          if (!nextOpen) resetPredictionForm();
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] sm:mx-auto sm:max-w-lg"
          data-testid="prediction-form-sheet"
        >
          <SheetHeader className="pb-1">
            <SheetTitle>
              {editingPredictionId ? "Editar previsão" : "Nova previsão"}
            </SheetTitle>
            <SheetDescription>
              {editingPredictionId
                ? "Corrija os dados desta previsão avulsa pendente."
                : predictionForm.isRecurring
                  ? "Marque como recorrente para gerar as próximas previsões automaticamente."
                  : "Planeje uma receita ou despesa sem criar um lançamento real."}
            </SheetDescription>
          </SheetHeader>

          <form
            onSubmit={handleSavePrediction}
            className="flex flex-col gap-5 px-4 pt-2"
            data-testid="prediction-form"
          >
            <FormSelect
              id="prediction-type"
              label="Tipo"
              value={predictionForm.type}
              onChange={(event) =>
                setPredictionForm((current) => ({
                  ...current,
                  type: event.target.value as "expense" | "income",
                  categoryId: "",
                }))
              }
            >
              <option value="expense">Despesa prevista</option>
              <option value="income">Receita prevista</option>
            </FormSelect>

            <FormInput
              id="prediction-description"
              label="Descrição"
              type="text"
              value={predictionForm.description}
              onChange={(event) =>
                setPredictionForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Ex.: IPVA, bônus, manutenção..."
              required
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField id="prediction-amount" label="Valor previsto">
                <CurrencyInput
                  id="prediction-amount"
                  valueCents={amountStringToCents(predictionForm.amount)}
                  onValueCentsChange={(nextCents) =>
                    setPredictionForm((current) => ({
                      ...current,
                      amount: nextCents > 0 ? String(nextCents / 100) : "",
                    }))
                  }
                  placeholder="0,00"
                  required
                  className="h-10 w-full min-w-0 rounded-lg border border-input bg-surface-sunken/60 px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/40"
                />
              </FormField>

              <FormInput
                id="prediction-scheduled-date"
                label={
                  predictionForm.isRecurring && !editingPredictionId
                    ? "Primeira ocorrência"
                    : "Data prevista"
                }
                type="date"
                value={predictionForm.scheduledDate}
                onChange={(event) =>
                  setPredictionForm((current) => ({
                    ...current,
                    scheduledDate: event.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <FormSelect
                id="prediction-category"
                label="Categoria (opcional)"
                value={predictionForm.categoryId}
                onChange={(event) =>
                  setPredictionForm((current) => ({
                    ...current,
                    categoryId: event.target.value,
                  }))
                }
              >
                <option value="">Sem categoria</option>
                {selectablePredictionCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </FormSelect>

              <FormSelect
                id="prediction-account"
                label={
                  predictionForm.isRecurring && !editingPredictionId
                    ? "Conta prevista"
                    : "Conta prevista (opcional)"
                }
                value={predictionForm.accountId}
                onChange={(event) =>
                  setPredictionForm((current) => ({
                    ...current,
                    accountId: event.target.value,
                  }))
                }
                required={predictionForm.isRecurring && !editingPredictionId}
              >
                {!predictionForm.isRecurring || editingPredictionId ? (
                  <option value="">Definir na liquidação</option>
                ) : null}
                {postableAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatAccountSelectLabel(account, { includeScope: true })}
                  </option>
                ))}
              </FormSelect>
            </div>

            <p className="-mt-2 text-xs text-muted-foreground">
              {predictionForm.isRecurring && !editingPredictionId
                ? "Recorrências precisam de uma conta. As próximas previsões são geradas a partir da data inicial."
                : "Sem conta prevista, a previsão será pessoal. A conta real será escolhida ao liquidar."}
            </p>

            {!editingPredictionId ? (
              <div className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-4">
                <label className="flex items-start gap-3">
                  <input
                    id="prediction-is-recurring"
                    type="checkbox"
                    checked={predictionForm.isRecurring}
                    onChange={(event) =>
                      setPredictionForm((current) => ({
                        ...current,
                        isRecurring: event.target.checked,
                      }))
                    }
                    className="mt-0.5 size-4 rounded border-input accent-primary"
                    data-testid="prediction-is-recurring"
                  />
                  <span className="space-y-1">
                    <Label htmlFor="prediction-is-recurring">Repetir</Label>
                    <span className="block text-xs text-muted-foreground">
                      Ideal para salário, aluguel, assinaturas e outros
                      compromissos previsíveis. A data acima vira a primeira
                      previsão.
                    </span>
                  </span>
                </label>

                {predictionForm.isRecurring ? (
                  <div className="grid gap-5 border-t border-border/50 pt-4">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <FormSelect
                        id="prediction-recurrence-frequency"
                        label="Frequência"
                        value={predictionForm.frequency}
                        onChange={(event) =>
                          setPredictionForm((current) => ({
                            ...current,
                            frequency: event.target
                              .value as RecurrenceFrequency,
                          }))
                        }
                      >
                        {RECURRENCE_FREQUENCY_OPTIONS.map((frequency) => (
                          <option key={frequency} value={frequency}>
                            {RECURRENCE_FREQUENCY_LABELS[frequency]}
                          </option>
                        ))}
                      </FormSelect>

                      <FormSelect
                        id="prediction-recurrence-end-type"
                        label="Término"
                        value={predictionForm.endType}
                        onChange={(event) =>
                          setPredictionForm((current) => ({
                            ...current,
                            endType: event.target.value as RecurrenceEndType,
                          }))
                        }
                      >
                        {RECURRENCE_END_TYPE_OPTIONS.map((endType) => (
                          <option key={endType} value={endType}>
                            {RECURRENCE_END_TYPE_LABELS[endType]}
                          </option>
                        ))}
                      </FormSelect>
                    </div>

                    {predictionForm.endType === "until_date" ? (
                      <FormInput
                        id="prediction-recurrence-end-date"
                        label="Data final"
                        type="date"
                        min={predictionForm.scheduledDate}
                        value={predictionForm.endDate}
                        onChange={(event) =>
                          setPredictionForm((current) => ({
                            ...current,
                            endDate: event.target.value,
                          }))
                        }
                        required
                      />
                    ) : null}

                    {predictionForm.endType === "occurrences_count" ? (
                      <FormInput
                        id="prediction-recurrence-occurrences-limit"
                        label="Quantidade de ocorrências"
                        type="number"
                        min="1"
                        step="1"
                        value={predictionForm.occurrencesLimit}
                        onChange={(event) =>
                          setPredictionForm((current) => ({
                            ...current,
                            occurrencesLimit: event.target.value,
                          }))
                        }
                        required
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <label className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 p-3">
              <input
                type="checkbox"
                checked={predictionForm.includeInProjection}
                onChange={(event) =>
                  setPredictionForm((current) => ({
                    ...current,
                    includeInProjection: event.target.checked,
                  }))
                }
                className="mt-0.5 size-4 rounded border-input accent-primary"
                data-testid="prediction-include-in-projection"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">
                  Incluir no saldo projetado
                </span>
                <span className="block text-xs text-muted-foreground">
                  {predictionForm.isRecurring && !editingPredictionId
                    ? "Considera as ocorrências pendentes desta recorrência."
                    : "Considera esta previsão enquanto ela estiver pendente."}
                </span>
              </span>
            </label>

            <SheetFooter className="px-0 pb-2">
              <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={predictionSaving}
                  onClick={() => setPredictionOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="shadow-sm"
                  disabled={predictionSaving}
                  data-testid="save-prediction-button"
                >
                  {predictionSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : editingPredictionId ? (
                    "Salvar alterações"
                  ) : predictionForm.isRecurring ? (
                    "Salvar recorrência"
                  ) : (
                    "Salvar previsão"
                  )}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

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
              {isEditingRecurrence
                ? "Editar recorrência"
                : isEditing
                  ? "Editar lançamento"
                  : "Novo lançamento"}
            </SheetTitle>
            <SheetDescription>
              {isEditingRecurrence
                ? "As mudanças valem para as próximas previsões. O que já passou ou já foi liquidado permanece como está."
                : isEditing
                  ? "Atualize os dados do lançamento selecionado."
                  : form.isRecurring
                    ? "Crie um modelo e gere as próximas ocorrências previstas."
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
                disabled={isEditing || isEditingRecurrence}
              >
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
                <option value="transfer">Transferência</option>
              </FormSelect>

              <FormInput
                id="description"
                label={
                  form.type === "transfer"
                    ? "Descrição (opcional)"
                    : "Descrição"
                }
                type="text"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder={
                  form.type === "transfer"
                    ? "Ex.: Reserva do mês, ajuste entre contas..."
                    : "Ex.: Supermercado, salário, TED..."
                }
                required={form.type !== "transfer"}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="amount" label="Valor">
                  <CurrencyInput
                    id="amount"
                    valueCents={amountStringToCents(form.amount)}
                    onValueCentsChange={(nextCents) =>
                      setForm((current) => ({
                        ...current,
                        amount: nextCents > 0 ? String(nextCents / 100) : "",
                      }))
                    }
                    placeholder="0,00"
                    required
                    className="h-10 w-full min-w-0 rounded-lg border border-input bg-surface-sunken/60 px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/40"
                  />
                </FormField>

                <FormInput
                  id="date"
                  label={
                    isEditingRecurrence || form.isRecurring
                      ? "Data inicial"
                      : "Data"
                  }
                  type="date"
                  value={form.date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                  disabled={isEditingRecurrence}
                  required
                />
              </div>
              {isEditingRecurrence ? (
                <p className="-mt-3 text-xs text-muted-foreground">
                  A data inicial da regra não muda na edição — só as próximas
                  previsões são recalculadas.
                </p>
              ) : null}

              {form.type === "transfer" ? (
                <div className="space-y-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
                  <p className="text-sm text-muted-foreground">
                    {TRANSFER_FLOW_HINT}
                  </p>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormSelect
                      id="transfer-from-account"
                      label="Sai de"
                      value={form.accountId}
                      onChange={(event) =>
                        setForm((current) => {
                          const nextFrom = event.target.value;
                          const nextTo =
                            current.toAccountId === nextFrom
                              ? transferEligibleAccounts.find(
                                  (account) => account.id !== nextFrom,
                                )?.id ?? ""
                              : current.toAccountId;
                          return {
                            ...current,
                            accountId: nextFrom,
                            toAccountId: nextTo,
                          };
                        })
                      }
                      required
                      data-testid="transfer-from-account"
                    >
                      <option value="">Selecione a origem</option>
                      {transferEligibleAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {formatAccountSelectLabel(account, {
                            includeType: true,
                            includeScope: true,
                          })}
                        </option>
                      ))}
                    </FormSelect>

                    <FormSelect
                      id="transfer-to-account"
                      label="Entra em"
                      value={form.toAccountId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          toAccountId: event.target.value,
                        }))
                      }
                      required
                      data-testid="transfer-to-account"
                    >
                      <option value="">Selecione o destino</option>
                      {transferEligibleAccounts
                        .filter((account) => account.id !== form.accountId)
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {formatAccountSelectLabel(account, {
                              includeType: true,
                              includeScope: true,
                            })}
                          </option>
                        ))}
                    </FormSelect>
                  </div>
                  {form.accountId && form.toAccountId ? (
                    <p className="text-sm font-medium">
                      Sai de{" "}
                      <span className="text-destructive">
                        {accounts.find((account) => account.id === form.accountId)
                          ?.name ?? "origem"}
                      </span>{" "}
                      → entra em{" "}
                      <span className="text-primary">
                        {accounts.find((account) => account.id === form.toAccountId)
                          ?.name ?? "destino"}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : (
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
                        {formatAccountSelectLabel(account, { includeScope: true })}
                      </option>
                    ))}
                  </FormSelect>
                </div>
              )}

              {form.type !== "transfer" && (!isEditing || isEditingRecurrence) ? (
                <div className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-4">
                  {isEditingRecurrence ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Próximas ocorrências</p>
                      <p className="text-sm text-muted-foreground">
                        Valor, descrição, conta, frequência e término atualizam
                        só as previsões futuras. Previsões passadas e liquidadas
                        não mudam. Datas que saírem da regra são canceladas.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <input
                        id="is-recurring"
                        type="checkbox"
                        checked={form.isRecurring}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            isRecurring: event.target.checked,
                          }))
                        }
                        className="mt-0.5 size-4 rounded border-input accent-primary"
                      />
                      <div className="space-y-1">
                        <Label htmlFor="is-recurring">Recorrente</Label>
                        <p className="text-sm text-muted-foreground">
                          Salva um modelo e cria ocorrências previstas.
                        </p>
                      </div>
                    </div>
                  )}

                  {isEditingRecurrence || form.isRecurring ? (
                    <div
                      className={`grid gap-5 ${
                        isEditingRecurrence
                          ? ""
                          : "border-t border-border/50 pt-4"
                      }`}
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        <FormSelect
                          id="recurrence-frequency"
                          label="Frequência"
                          value={form.frequency}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              frequency: event.target
                                .value as RecurrenceFrequency,
                            }))
                          }
                        >
                          {RECURRENCE_FREQUENCY_OPTIONS.map((frequency) => (
                            <option key={frequency} value={frequency}>
                              {RECURRENCE_FREQUENCY_LABELS[frequency]}
                            </option>
                          ))}
                        </FormSelect>

                        <FormSelect
                          id="recurrence-end-type"
                          label="Término"
                          value={form.endType}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              endType: event.target.value as RecurrenceEndType,
                            }))
                          }
                        >
                          {RECURRENCE_END_TYPE_OPTIONS.map((endType) => (
                            <option key={endType} value={endType}>
                              {RECURRENCE_END_TYPE_LABELS[endType]}
                            </option>
                          ))}
                        </FormSelect>
                      </div>

                      {form.endType === "until_date" ? (
                        <FormInput
                          id="recurrence-end-date"
                          label="Data final"
                          type="date"
                          min={form.date}
                          value={form.endDate}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              endDate: event.target.value,
                            }))
                          }
                          required
                        />
                      ) : null}

                      {form.endType === "occurrences_count" ? (
                        <FormInput
                          id="recurrence-occurrences-limit"
                          label="Quantidade de ocorrências"
                          type="number"
                          min="1"
                          step="1"
                          value={form.occurrencesLimit}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              occurrencesLimit: event.target.value,
                            }))
                          }
                          required
                        />
                      ) : null}

                      <div className="flex items-start gap-3">
                        <input
                          id="recurrence-include-in-projection"
                          type="checkbox"
                          checked={form.includeInProjection}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              includeInProjection: event.target.checked,
                            }))
                          }
                          className="mt-0.5 size-4 rounded border-input accent-primary"
                        />
                        <div className="space-y-1">
                          <Label htmlFor="recurrence-include-in-projection">
                            Incluir no saldo projetado
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Considera as ocorrências pendentes desta recorrência.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <input
                          id="recurrence-auto-confirm"
                          type="checkbox"
                          checked={form.autoConfirm}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              autoConfirm: event.target.checked,
                            }))
                          }
                          className="mt-0.5 size-4 rounded border-input accent-primary"
                        />
                        <div className="space-y-1">
                          <Label htmlFor="recurrence-auto-confirm">
                            Confirmação automática
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Marca o modelo para confirmação automática futura.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
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
                  ) : isEditingRecurrence || isEditing ? (
                    "Salvar alterações"
                  ) : form.isRecurring ? (
                    "Salvar recorrência"
                  ) : (
                    "Salvar lançamento"
                  )}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={settleTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeSettleDialog();
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] sm:mx-auto sm:max-w-lg"
          data-testid="settle-prediction-sheet"
        >
          <SheetHeader className="pb-1">
            <SheetTitle>Liquidar previsão</SheetTitle>
            <SheetDescription>
              Informe como o {settleTarget?.type === "income"
                ? "recebimento"
                : "pagamento"}{" "}
              aconteceu de verdade.
            </SheetDescription>
          </SheetHeader>

          {settleTarget ? (
            <form
              onSubmit={handleConfirmSettlement}
              className="flex flex-col gap-5 px-4 pt-2"
            >
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {settleTarget.description}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Previsto para {formatDate(settleTarget.scheduledDate)}
                      <span aria-hidden> · </span>
                      {settleTarget.categoryId
                        ? categoryMap.get(settleTarget.categoryId)?.name ??
                          "Sem categoria"
                        : "Sem categoria"}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Conta prevista:{" "}
                      {settleTarget.accountId
                        ? accountMap.get(settleTarget.accountId)?.name ??
                          "Conta"
                        : "a definir"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${typeMap[settleTarget.type].valueClass}`}
                  >
                    {settleTarget.type === "expense" ? "-" : ""}
                    {formatCurrency(settleTarget.amount)}
                  </span>
                </div>
              </div>

              <FormSelect
                id="settle-account"
                label="Conta utilizada"
                value={settleForm.accountId}
                onChange={(event) =>
                  setSettleForm((current) => ({
                    ...current,
                    accountId: event.target.value,
                  }))
                }
                required
              >
                {postableAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatAccountSelectLabel(account, { includeScope: true })}
                  </option>
                ))}
              </FormSelect>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormInput
                  id="settle-date"
                  label={
                    settleTarget.type === "income"
                      ? "Data do recebimento"
                      : "Data do pagamento"
                  }
                  type="date"
                  value={settleForm.date}
                  onChange={(event) =>
                    setSettleForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                  required
                />

                <FormField id="settle-amount" label="Valor real (opcional)">
                  <CurrencyInput
                    id="settle-amount"
                    valueCents={settleForm.amountCents}
                    onValueCentsChange={(nextCents) =>
                      setSettleForm((current) => ({
                        ...current,
                        amountCents: nextCents,
                      }))
                    }
                    placeholder={formatCurrency(settleTarget.amount)}
                    className="h-10 w-full min-w-0 rounded-lg border border-input bg-surface-sunken/60 px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/40"
                    data-testid="settle-amount-input"
                  />
                </FormField>
              </div>

              <SettlementDiffHint
                predictedAmount={settleTarget.amount}
                amountCents={settleForm.amountCents}
              />

              <SheetFooter className="px-0 pb-2">
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeSettleDialog}
                    disabled={settling}
                  >
                    Voltar
                  </Button>
                  <Button
                    type="submit"
                    className="shadow-sm"
                    disabled={settling}
                    data-testid="confirm-settlement-button"
                  >
                    {settling ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Liquidando...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Confirmar liquidação
                      </>
                    )}
                  </Button>
                </div>
              </SheetFooter>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>

      <Card
        className="animate-enter-delayed border-border/50 shadow-sm"
        data-testid="lancamentos-summary"
        data-ready={loading ? "false" : "true"}
      >
        <CardContent
          className={`grid gap-4 pt-6 sm:gap-0 sm:divide-x sm:divide-border/60 ${
            cardStatement?.usesStatementCycle
              ? "sm:grid-cols-4"
              : "sm:grid-cols-3"
          }`}
        >
          <div className="space-y-1 sm:px-4 sm:first:pl-0">
            <p className="text-sm text-muted-foreground">
              {cardStatement?.usesStatementCycle
                ? "Pagamentos da fatura"
                : `Receitas ${summaryScopeLabel}`}
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
              {cardStatement?.usesStatementCycle
                ? "Despesas do ciclo"
                : `Despesas ${summaryScopeLabel}`}
            </p>
            <p
              className="text-2xl font-semibold text-destructive tabular-nums sm:text-3xl"
              data-testid="lancamentos-expense-total"
            >
              {formatCurrency(expenses)}
            </p>
          </div>

          {cardStatement?.usesStatementCycle && amountDue != null ? (
            <div className="space-y-1 sm:px-4">
              <p className="text-sm text-muted-foreground">
                Total a pagar nesta fatura
              </p>
              <p
                className="text-2xl font-semibold text-destructive tabular-nums sm:text-3xl"
                data-testid="lancamentos-amount-due-total"
              >
                {formatCurrency(amountDue)}
              </p>
            </div>
          ) : null}

          <div className="space-y-1 sm:px-4 sm:last:pr-0">
            <p className="text-sm text-muted-foreground">
              {cardStatement?.usesStatementCycle
                ? "Restante a pagar"
                : period.mode === "all"
                  ? "Saldo total"
                  : "Saldo do mês"}
            </p>
            <p
              className={`text-2xl font-semibold tabular-nums sm:text-3xl ${
                cardStatement?.usesStatementCycle
                  ? cardStatement.settlement.remainingTotal <= 0
                    ? "text-primary"
                    : "text-destructive"
                  : balance >= 0
                    ? "text-primary"
                    : "text-destructive"
              }`}
              data-testid="lancamentos-balance-total"
            >
              {formatCurrency(
                cardStatement?.usesStatementCycle
                  ? cardStatement.settlement.remainingTotal
                  : balance,
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {showMonthlyPredictionAggregates ? (
        <Card className="animate-enter-delayed border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="font-semibold">
              Previsto vs realizado do mês
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Previsões agendadas neste mês e os valores já liquidados.
            </p>
          </CardHeader>
          <CardContent
            className="grid gap-4 pt-0 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border/60"
            data-testid="monthly-prediction-aggregates"
          >
            <div className="space-y-1 sm:px-4 sm:first:pl-0">
              <p className="text-sm text-muted-foreground">Total previsto</p>
              <p
                className="text-xl font-semibold tabular-nums sm:text-2xl"
                data-testid="monthly-predicted-total"
              >
                {formatCurrency(monthlyPredictionAggregates.predicted)}
              </p>
            </div>

            <div className="space-y-1 sm:px-4">
              <p className="text-sm text-muted-foreground">Total realizado</p>
              <p
                className="text-xl font-semibold tabular-nums sm:text-2xl"
                data-testid="monthly-realized-total"
              >
                {formatCurrency(monthlyPredictionAggregates.realized)}
              </p>
            </div>

            <div className="space-y-1 sm:px-4 sm:last:pr-0">
              <p className="text-sm text-muted-foreground">Delta do período</p>
              <p
                className={`text-xl font-semibold tabular-nums sm:text-2xl ${
                  monthlyPredictionDiff.kind === "above"
                    ? "text-amber-600 dark:text-amber-400"
                    : monthlyPredictionDiff.kind === "below"
                      ? "text-primary"
                      : ""
                }`}
                data-testid="monthly-prediction-delta"
              >
                {formatCurrency(
                  Math.abs(monthlyPredictionAggregates.delta),
                )}
              </p>
              <PredictionDiffLine diff={monthlyPredictionDiff} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="animate-enter-delayed border-border/50 shadow-sm">
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setRecurrencesExpanded((current) => !current)}
          aria-expanded={recurrencesExpanded}
          aria-controls="recurrences-panel"
          data-testid="recurrences-toggle"
        >
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex items-center gap-2 font-semibold">
                  <Repeat2 className="size-5 text-primary" />
                  Recorrências
                </CardTitle>
                <p className="truncate text-sm text-muted-foreground">
                  {loading
                    ? "Carregando recorrências..."
                    : recurrences.length === 0
                      ? "Nenhuma recorrência cadastrada."
                      : (() => {
                          const pausedCount = recurrences.filter(
                            (item) => item.isPaused,
                          ).length;
                          const activeCount = recurrences.length - pausedCount;
                          const parts: string[] = [];
                          if (activeCount > 0) {
                            parts.push(
                              `${activeCount} ${
                                activeCount === 1 ? "ativa" : "ativas"
                              }`,
                            );
                          }
                          if (pausedCount > 0) {
                            parts.push(
                              `${pausedCount} ${
                                pausedCount === 1 ? "pausada" : "pausadas"
                              }`,
                            );
                          }
                          return `${parts.join(" · ")}${
                            nextRecurringPrediction
                              ? ` · Próxima: ${nextRecurringPrediction.description} em ${formatDate(nextRecurringPrediction.scheduledDate)}`
                              : ""
                          }`;
                        })()}
                </p>
              </div>
              <ChevronDown
                className={`size-5 shrink-0 text-muted-foreground transition-transform ${
                  recurrencesExpanded ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </div>
          </CardHeader>
        </button>
        {recurrencesExpanded ? (
          <CardContent id="recurrences-panel" className="pt-0">
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando recorrências...
              </div>
            ) : recurrences.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-8 text-center">
                <p className="text-sm font-medium">
                  Nenhuma recorrência cadastrada
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crie um lançamento recorrente para vê-lo aqui.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {[...recurrences]
                  .sort((a, b) => Number(a.isPaused) - Number(b.isPaused))
                  .map((recurrence) => {
                  const config = typeMap[recurrence.type];
                  const Icon = config.icon;
                  const account = accountMap.get(recurrence.accountId);
                  const nextOccurrence = nextPendingByRecurrence.get(
                    recurrence.id,
                  );
                  const lifecycle = getRecurrenceLifecycleStatus(recurrence);
                  const isBusy =
                    endingRecurrenceId === recurrence.id ||
                    pausingRecurrenceId === recurrence.id;
                  const actionsDisabled =
                    endingRecurrenceId !== null || pausingRecurrenceId !== null;
                  const isHighlighted = isRecurrenceRowHighlighted(
                    recurrence.id,
                    focusedRecurrenceId,
                  );
                  const isUpdatingProjection =
                    updatingProjectionId === recurrence.id;

                  return (
                    <div
                      key={recurrence.id}
                      id={getRecurrenceRowElementId(recurrence.id)}
                      tabIndex={-1}
                      data-testid={`recurrence-row-${recurrence.id}`}
                      data-highlighted={isHighlighted ? "true" : undefined}
                      className={cn(
                        "flex flex-col gap-3 rounded-xl py-4 outline-none transition-[background-color,box-shadow] duration-300 first:pt-2 last:pb-2 sm:flex-row sm:items-center sm:justify-between",
                        getRecurrenceNavigationHighlightClassName(isHighlighted),
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10 ${config.iconClass}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {recurrence.description}
                            </p>
                            <Badge
                              variant={
                                lifecycle === "paused"
                                  ? "secondary"
                                  : "outline"
                              }
                              data-testid={`recurrence-status-${recurrence.id}`}
                            >
                              {RECURRENCE_LIFECYCLE_STATUS_LABELS[lifecycle]}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {frequencyLabels[recurrence.frequency]}
                            <span aria-hidden> · </span>
                            {account?.name ?? "Conta"}
                            <span aria-hidden> · </span>
                            {lifecycle === "paused"
                              ? "Pausada — sem novas previsões"
                              : nextOccurrence
                                ? `Próxima em ${formatDate(nextOccurrence.scheduledDate)}`
                                : "Sem previsões pendentes"}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                        <span
                          className={`font-semibold tabular-nums ${config.valueClass}`}
                        >
                          {recurrence.type === "expense" ? "-" : ""}
                          {formatCurrency(recurrence.amount)}
                        </span>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={recurrence.includeInProjection}
                            disabled={updatingProjectionId !== null}
                            onChange={(event) =>
                              void handleRecurrenceProjectionChange(
                                recurrence,
                                event.target.checked,
                              )
                            }
                            className="size-4 rounded border-input accent-primary"
                            aria-label={`Incluir ${recurrence.description} no saldo projetado`}
                          />
                          {isUpdatingProjection ? "Atualizando..." : "Projetar"}
                        </label>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={actionsDisabled}
                          onClick={() => openEditRecurrence(recurrence)}
                          aria-label={`Editar recorrência ${recurrence.description}`}
                          data-testid={`edit-recurrence-${recurrence.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {lifecycle === "paused" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={actionsDisabled}
                            onClick={() =>
                              void handleResumeRecurrence(recurrence)
                            }
                            data-testid={`resume-recurrence-${recurrence.id}`}
                          >
                            {isBusy && pausingRecurrenceId === recurrence.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                            Retomar recorrência
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={actionsDisabled}
                            onClick={() =>
                              void handlePauseRecurrence(recurrence)
                            }
                            data-testid={`pause-recurrence-${recurrence.id}`}
                          >
                            {isBusy && pausingRecurrenceId === recurrence.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Pause className="h-4 w-4" />
                            )}
                            Pausar recorrência
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={actionsDisabled}
                          onClick={() => void handleEndRecurrence(recurrence)}
                          data-testid={`end-recurrence-${recurrence.id}`}
                        >
                          {isBusy && endingRecurrenceId === recurrence.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Encerrar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        ) : null}
      </Card>

      <Card className="animate-enter-delayed border-border/50 shadow-sm">
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setPredictionsExpanded((current) => !current)}
          aria-expanded={predictionsExpanded}
          aria-controls="pending-predictions-panel"
          data-testid="pending-predictions-toggle"
        >
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex items-center gap-2 font-semibold">
                  <CalendarClock className="size-5 text-primary" />
                  Previsões pendentes
                </CardTitle>
                <p className="truncate text-sm text-muted-foreground">
                  {loading
                    ? "Carregando previsões..."
                    : visiblePendingPredictions.length === 0
                      ? "Nenhuma previsão pendente no período."
                      : pendingPredictionUrgencySummary
                        ? pendingPredictionUrgencySummary
                        : `${visiblePendingPredictions.length} ${
                            visiblePendingPredictions.length === 1
                              ? "previsão pendente"
                              : "previsões pendentes"
                          }`}
                </p>
              </div>
              <ChevronDown
                className={`size-5 shrink-0 text-muted-foreground transition-transform ${
                  predictionsExpanded ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </div>
          </CardHeader>
        </button>
        {predictionsExpanded ? (
        <CardContent id="pending-predictions-panel" className="pt-0">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando previsões...
            </div>
          ) : visiblePendingPredictions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-8 text-center">
              <p className="text-sm font-medium">
                Nenhuma previsão pendente
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Previsões avulsas e ocorrências de recorrências aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {pendingPredictionUrgencyGroups.map((group) => (
                <section
                  key={group.urgency}
                  aria-label={group.label}
                  data-testid={`pending-predictions-${group.urgency}`}
                >
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h3
                      className={cn(
                        "text-xs font-semibold tracking-wide uppercase",
                        group.urgency === "overdue"
                          ? "text-rose-700 dark:text-rose-300"
                          : group.urgency === "due_today"
                            ? "text-amber-800 dark:text-amber-200"
                            : "text-muted-foreground",
                      )}
                    >
                      {group.label}
                    </h3>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {group.items.map((prediction) => {
                      const config = typeMap[prediction.type];
                      const Icon = config.icon;
                      const account = prediction.accountId
                        ? accountMap.get(prediction.accountId)
                        : null;
                      const category = prediction.categoryId
                        ? categoryMap.get(prediction.categoryId)
                        : null;
                      const isBusy = settlingPredictionId === prediction.id;
                      const isUpdatingProjection =
                        updatingPredictionProjectionId === prediction.id;
                      const urgency = group.urgency;
                      const linkedRecurrence = prediction.recurrenceId
                        ? recurrenceById.get(prediction.recurrenceId)
                        : null;
                      const recurrenceOrigin =
                        getPendingPredictionRecurrenceOrigin(
                          prediction.recurrenceId,
                          linkedRecurrence,
                        );

                      return (
                        <div
                          key={prediction.id}
                          data-urgency={urgency}
                          className={cn(
                            "flex flex-col gap-3 py-4 first:pt-2 last:pb-2 sm:flex-row sm:items-center sm:justify-between",
                            urgency === "overdue" &&
                              "rounded-r-xl border-l-2 border-l-rose-500/50 bg-rose-500/[0.04] pl-3 dark:bg-rose-500/[0.07]",
                            urgency === "due_today" &&
                              "rounded-r-xl border-l-2 border-l-amber-500/40 bg-amber-500/[0.04] pl-3 dark:bg-amber-500/[0.07]",
                          )}
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <div
                              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10 ${config.iconClass}`}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">
                                  {prediction.description}
                                </p>
                                {recurrenceOrigin ? (
                                  recurrenceOrigin.canNavigate &&
                                  prediction.recurrenceId ? (
                                    <Badge
                                      render={<button type="button" />}
                                      variant={
                                        recurrenceOrigin.isPaused
                                          ? "secondary"
                                          : "outline"
                                      }
                                      className="cursor-pointer hover:bg-muted"
                                      title="Ver recorrência"
                                      aria-label={`Ver recorrência: ${recurrenceOrigin.label}`}
                                      data-testid={`prediction-recurrence-origin-${prediction.id}`}
                                      onClick={() => {
                                        const targetId =
                                          prediction.recurrenceId;
                                        if (targetId) {
                                          focusRecurrenceOrigin(targetId);
                                        }
                                      }}
                                    >
                                      {recurrenceOrigin.label}
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant={
                                        recurrenceOrigin.isPaused
                                          ? "secondary"
                                          : "outline"
                                      }
                                      data-testid={`prediction-recurrence-origin-${prediction.id}`}
                                    >
                                      {recurrenceOrigin.label}
                                    </Badge>
                                  )
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                <span
                                  className={cn(
                                    urgency === "overdue" &&
                                      "font-medium text-rose-700 dark:text-rose-300",
                                    urgency === "due_today" &&
                                      "font-medium text-amber-800 dark:text-amber-200",
                                  )}
                                >
                                  {urgency === "due_today"
                                    ? "Hoje"
                                    : formatDate(prediction.scheduledDate)}
                                  {urgency === "overdue" ? " · Atrasada" : null}
                                </span>
                                <span aria-hidden> · </span>
                                {category?.name ?? "Sem categoria"}
                                <span aria-hidden> · </span>
                                {account?.name ?? "Conta a definir"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 sm:justify-end">
                            <span
                              className={`font-semibold tabular-nums ${config.valueClass}`}
                            >
                              {prediction.type === "expense" ? "-" : ""}
                              {formatCurrency(prediction.amount)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <label className="mr-1 flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={prediction.includeInProjection}
                                  disabled={
                                    updatingPredictionProjectionId !== null
                                  }
                                  onChange={(event) =>
                                    void handlePredictionProjectionChange(
                                      prediction,
                                      event.target.checked,
                                    )
                                  }
                                  className="size-4 rounded border-input accent-primary"
                                  aria-label={`Incluir ${prediction.description} no saldo projetado`}
                                />
                                {isUpdatingProjection
                                  ? "Atualizando..."
                                  : "Projetar"}
                              </label>
                              {!prediction.recurrenceId ? (
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  disabled={settlingPredictionId !== null}
                                  onClick={() =>
                                    openEditPrediction(prediction)
                                  }
                                  aria-label={`Editar previsão ${prediction.description}`}
                                  data-testid={`edit-prediction-${prediction.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={settlingPredictionId !== null}
                                onClick={() => openSettleDialog(prediction)}
                                data-testid={`settle-prediction-${prediction.id}`}
                              >
                                {isBusy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                                Liquidar
                              </Button>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                disabled={settlingPredictionId !== null}
                                onClick={() =>
                                  void handleCancelPrediction(prediction)
                                }
                                aria-label={`Cancelar previsão ${prediction.description}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
        ) : null}
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
              <p className="text-sm font-medium">{listEmptyCopy.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {listEmptyCopy.description}
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
                const settledDiff = settledDiffByTransactionId.get(
                  transaction.id,
                );
                const isCard = account?.type === "credit_card";
                const accountKind = getAccountKindLabel(account);
                const invoiceSignal = detectInvoicePaymentSignal({
                  description: transaction.description,
                  accountType: account?.type,
                });
                const invoiceLabel = getInvoicePaymentLabel(invoiceSignal);
                const reconcileBadge = getInvoicePaymentReconcileBadge({
                  invoicePaymentOrigin: transaction.invoicePaymentOrigin,
                  reconciledWithTransactionId:
                    transaction.reconciledWithTransactionId,
                });
                const reconcileBadgeLabel =
                  getInvoicePaymentReconcileBadgeLabel(reconcileBadge);
                const statementRelation =
                  selectedAccount &&
                  selectedAccount.type === "credit_card" &&
                  account?.id === selectedAccount.id
                    ? cardStatement?.usesStatementCycle
                      ? "current"
                      : getTransactionStatementRelation({
                          account: selectedAccount,
                          transactionDate: transaction.date,
                          referenceDate: statementReferenceDate,
                        })
                    : null;
                const linkedTransfer = isLinkedAccountTransfer(transaction);
                const origin = resolveTransactionOrigin(
                  transaction.id,
                  importedTransactionIds,
                );
                const originLabel = getTransactionOriginLabel(origin);
                const linkedTransaction = transaction.linkedTransactionId
                  ? transactionById.get(transaction.linkedTransactionId)
                  : null;
                const linkedAccount = linkedTransaction
                  ? accountMap.get(linkedTransaction.accountId)
                  : null;
                const transferOut = isTransferOutDescription(
                  transaction.description,
                );
                const transferIn = isTransferInDescription(
                  transaction.description,
                );

                return (
                  <div
                    key={transaction.id}
                    className={cn(
                      "group -mx-2 flex flex-col gap-3 rounded-xl px-2 py-4 transition-colors first:pt-2 last:pb-2 hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between",
                      invoiceSignal && "bg-violet-500/5 hover:bg-violet-500/10",
                      linkedTransfer && "bg-sky-500/5 hover:bg-sky-500/10",
                    )}
                    data-testid={`transaction-row-${transaction.id}`}
                    data-account-kind={accountKind}
                    data-transfer-linked={linkedTransfer ? "true" : "false"}
                    data-origin={origin}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10 ${config.iconClass}`}
                      >
                        {isCard ? (
                          <CreditCard className="h-4 w-4" />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="font-medium">{transaction.description}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatDate(transaction.date)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                          <span>
                            {linkedTransfer
                              ? "Transferência"
                              : (category?.name ?? "Sem categoria")}
                          </span>
                          <span aria-hidden>·</span>
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            {account ? (
                              <AccountIdentityMark
                                account={account}
                                size="xs"
                              />
                            ) : null}
                            <span className="truncate">
                              {account?.name ?? "Conta"}
                            </span>
                          </span>
                          {linkedAccount ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="inline-flex min-w-0 items-center gap-1.5">
                                <AccountIdentityMark
                                  account={linkedAccount}
                                  size="xs"
                                />
                                <span className="truncate">
                                  {transferOut
                                    ? `→ ${linkedAccount.name}`
                                    : transferIn
                                      ? `← ${linkedAccount.name}`
                                      : `Vinculada a ${linkedAccount.name}`}
                                </span>
                              </span>
                            </>
                          ) : null}
                          <span aria-hidden>·</span>
                          <span>
                            {transaction.familyId ? "Compartilhado" : "Pessoal"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge
                            variant="outline"
                            className={
                              isCard
                                ? "border-violet-500/25 bg-violet-500/5 text-violet-700 dark:text-violet-300"
                                : "border-border bg-muted/40 text-muted-foreground"
                            }
                          >
                            {accountKind}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={getTransactionOriginBadgeClass(origin)}
                            data-testid={`transaction-origin-${transaction.id}`}
                          >
                            {originLabel}
                          </Badge>
                          {linkedTransfer ? (
                            <Badge
                              variant="outline"
                              className="border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                            >
                              Vinculada
                            </Badge>
                          ) : null}
                          {invoiceLabel ? (
                            <Badge
                              variant="outline"
                              className="border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                            >
                              {invoiceLabel}
                            </Badge>
                          ) : null}
                          {reconcileBadgeLabel ? (
                            <Badge
                              variant="outline"
                              className={getInvoicePaymentReconcileBadgeClass(
                                reconcileBadge,
                              )}
                              data-testid={`invoice-reconcile-badge-${transaction.id}`}
                            >
                              {reconcileBadgeLabel}
                            </Badge>
                          ) : null}
                          {statementRelation === "current" ? (
                            <Badge
                              variant="outline"
                              className="border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                              data-testid={`statement-cycle-${transaction.id}`}
                            >
                              {STATEMENT_CYCLE_RELATION_LABELS.current}
                            </Badge>
                          ) : null}
                        </div>
                        {settledDiff ? (
                          <PredictionDiffLine
                            diff={settledDiff}
                            className="mt-1.5"
                          />
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:shrink-0 sm:flex-col sm:items-end">
                      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                        <Badge variant="outline" className={config.badgeClass}>
                          {config.label}
                        </Badge>
                        <span
                          className={`text-base font-semibold tabular-nums ${
                            transferOut
                              ? typeMap.expense.valueClass
                              : transferIn
                                ? typeMap.income.valueClass
                                : config.valueClass
                          }`}
                        >
                          {transaction.type === "expense" || transferOut
                            ? "-"
                            : ""}
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
                          <DropdownMenuContent align="end" className="w-44">
                            {!linkedTransfer ? (
                              <DropdownMenuItem
                                onClick={() => handleEdit(transaction)}
                              >
                                <Pencil className="h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDelete(transaction)}
                            >
                              <Trash2 className="h-4 w-4" />
                              {linkedTransfer
                                ? "Excluir transferência"
                                : "Excluir"}
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
