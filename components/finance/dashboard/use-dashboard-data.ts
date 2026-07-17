"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAppContext } from "@/contexts/app-context";
import {
  buildDailyCashflow,
  buildMemberExpenseParticipation,
  buildMonthSummary,
  buildSparklineSeries,
  getMonthExpenseShareOfYear,
  getMonthKey,
  getRecentTransactions,
  groupByMemberForMonth,
  groupExpensesByCategory,
  type DailyCashflowPoint,
  type ExpenseCategoryStat,
  type MemberMonthStat,
  type MemberParticipationStat,
  type MonthSummary,
  type RecentTransactionItem,
  type SparklinePoint,
} from "@/lib/finance/dashboard-stats";
import {
  filterAccountsByFinanceScope,
  getFinanceViewScope,
} from "@/lib/finance/finance-scope";
import { TRANSACTIONS_SELECT } from "@/lib/finance/transactions-query";
import { createClient } from "@/lib/supabase/client";
import { filterRealAccounts, type Account } from "@/types/account";
import { mapTransaction, type TransactionRow } from "@/types/transaction";

type FamilyMemberRow = {
  user_id: string;
  role: string;
  profiles?: {
    full_name: string | null;
    email: string | null;
  } | null;
};

export type DashboardData = {
  loading: boolean;
  error: string | null;
  monthSummary: MonthSummary;
  expenseCategories: ExpenseCategoryStat[];
  recentTransactions: RecentTransactionItem[];
  memberStats: MemberMonthStat[];
  memberParticipation: MemberParticipationStat[];
  yearExpenseSharePercent: number | null;
  dailyCashflow: DailyCashflowPoint[];
  sparklines: {
    net: SparklinePoint[];
    income: SparklinePoint[];
    expense: SparklinePoint[];
  };
  totalAccountBalance: number;
  refresh: () => Promise<void>;
};

export function useDashboardData(): DashboardData {
  const supabase = useMemo(() => createClient()!, []);
  const { user, activeFamily } = useAppContext();
  const monthKey = useMemo(() => getMonthKey(), []);

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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactionRows, setTransactionRows] = useState<TransactionRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [members, setMembers] = useState<FamilyMemberRow[]>([]);
  const [categoryNames, setCategoryNames] = useState<Map<string, string>>(
    new Map(),
  );

  const loadData = useCallback(async () => {
    if (!scope) {
      setTransactionRows([]);
      setAccounts([]);
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [accountsRes, categoriesRes] = await Promise.all([
      supabase.from("accounts").select("*").order("name"),
      supabase.from("categories").select("id, name"),
    ]);

    if (accountsRes.error) {
      console.error(accountsRes.error);
      setError("Não foi possível carregar as contas.");
      setLoading(false);
      return;
    }

    if (categoriesRes.error) {
      console.error(categoriesRes.error);
    }

    const scopedAccounts = filterAccountsByFinanceScope(
      (accountsRes.data ?? []) as Account[],
      scope,
    );
    const realAccounts = filterRealAccounts(scopedAccounts);
    const realAccountIds = realAccounts.map((account) => account.id);

    let rows: TransactionRow[] = [];

    if (realAccountIds.length > 0) {
      const transactionsRes = await supabase
        .from("transactions")
        .select(TRANSACTIONS_SELECT)
        .in("account_id", realAccountIds)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (transactionsRes.error) {
        console.error(transactionsRes.error);
        setError("Não foi possível carregar os lançamentos.");
        setLoading(false);
        return;
      }

      rows = (transactionsRes.data ?? []) as TransactionRow[];
    }

    setTransactionRows(rows);
    setAccounts(realAccounts);
    setCategoryNames(
      new Map(
        (categoriesRes.data ?? []).map((category) => [
          category.id,
          category.name,
        ]),
      ),
    );

    if (activeFamily) {
      const { data: membersData, error: membersError } = await supabase
        .from("family_members")
        .select("*")
        .eq("family_id", activeFamily.id)
        .order("created_at", { ascending: true });

      if (membersError) {
        console.error(membersError);
        setMembers([]);
      } else {
        const rawMembers = membersData ?? [];
        const userIds = rawMembers.map((member) => member.user_id);

        let profileMap = new Map<
          string,
          { full_name: string | null; email: string | null }
        >();

        if (userIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", userIds);

          if (profilesError) {
            console.error(profilesError);
          } else {
            profileMap = new Map(
              (profilesData ?? []).map((profile) => [profile.id, profile]),
            );
          }
        }

        setMembers(
          rawMembers.map((member) => ({
            user_id: member.user_id,
            role: member.role,
            profiles: profileMap.get(member.user_id) ?? null,
          })),
        );
      }
    } else {
      setMembers([]);
    }

    setLoading(false);
  }, [activeFamily, scope, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadData();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadData]);

  useEffect(() => {
    function handleTransactionsChanged() {
      void loadData();
    }

    window.addEventListener("casaflux:transactions-changed", handleTransactionsChanged);
    return () => {
      window.removeEventListener(
        "casaflux:transactions-changed",
        handleTransactionsChanged,
      );
    };
  }, [loadData]);

  const transactions = useMemo(
    () => transactionRows.map((row) => mapTransaction(row)),
    [transactionRows],
  );

  const monthSummary = useMemo(
    () => buildMonthSummary(transactions, monthKey),
    [transactions, monthKey],
  );

  const expenseCategories = useMemo(
    () => groupExpensesByCategory(transactions, categoryNames, monthKey),
    [transactions, categoryNames, monthKey],
  );

  const recentTransactions = useMemo(
    () => getRecentTransactions(transactionRows, 5),
    [transactionRows],
  );

  const memberStats = useMemo(
    () => groupByMemberForMonth(transactions, members, monthKey),
    [transactions, members, monthKey],
  );

  const memberParticipation = useMemo(
    () => buildMemberExpenseParticipation(memberStats),
    [memberStats],
  );

  const yearExpenseSharePercent = useMemo(
    () => getMonthExpenseShareOfYear(transactions, monthKey),
    [transactions, monthKey],
  );

  const dailyCashflow = useMemo(
    () => buildDailyCashflow(transactions, monthKey),
    [transactions, monthKey],
  );

  const sparklines = useMemo(() => {
    return {
      net: buildSparklineSeries(dailyCashflow, "net"),
      income: buildSparklineSeries(dailyCashflow, "income"),
      expense: buildSparklineSeries(dailyCashflow, "expense"),
    };
  }, [dailyCashflow]);

  const totalAccountBalance = useMemo(
    () => accounts.reduce((total, account) => total + Number(account.balance), 0),
    [accounts],
  );

  return {
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
    refresh: loadData,
  };
}
