import type { Transaction, TransactionRow } from "@/types/transaction";

export function getMonthKey(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getPreviousMonthKey(monthKey: string) {
  const [yearStr, monthStr] = monthKey.split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  date.setMonth(date.getMonth() - 1);
  return getMonthKey(date);
}

export function getNextMonthKey(monthKey: string) {
  const [yearStr, monthStr] = monthKey.split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  date.setMonth(date.getMonth() + 1);
  return getMonthKey(date);
}

export function getMonthLabel(monthKey: string, locale = "pt-BR") {
  const [yearStr, monthStr] = monthKey.split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function filterTransactionsByMonth(
  transactions: Transaction[],
  monthKey: string,
) {
  return transactions.filter(
    (transaction) => transaction.date.slice(0, 7) === monthKey,
  );
}

export function sumByType(
  transactions: Transaction[],
  type: Transaction["type"],
) {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export type MonthSummary = {
  monthKey: string;
  monthLabel: string;
  income: number;
  expense: number;
  netBalance: number;
  incomeCount: number;
  expenseCount: number;
  previousNetBalance: number | null;
  netChangePercent: number | null;
};

export function buildMonthSummary(
  allTransactions: Transaction[],
  monthKey: string,
): MonthSummary {
  const monthTransactions = filterTransactionsByMonth(allTransactions, monthKey);
  const previousMonthKey = getPreviousMonthKey(monthKey);
  const previousTransactions = filterTransactionsByMonth(
    allTransactions,
    previousMonthKey,
  );

  const income = sumByType(monthTransactions, "income");
  const expense = sumByType(monthTransactions, "expense");
  const netBalance = income - expense;

  const previousIncome = sumByType(previousTransactions, "income");
  const previousExpense = sumByType(previousTransactions, "expense");
  const previousNetBalance = previousIncome - previousExpense;

  let netChangePercent: number | null = null;

  if (previousNetBalance !== 0) {
    netChangePercent =
      ((netBalance - previousNetBalance) / Math.abs(previousNetBalance)) * 100;
  } else if (netBalance !== 0) {
    netChangePercent = 100;
  }

  return {
    monthKey,
    monthLabel: getMonthLabel(monthKey),
    income,
    expense,
    netBalance,
    incomeCount: monthTransactions.filter(
      (transaction) => transaction.type === "income",
    ).length,
    expenseCount: monthTransactions.filter(
      (transaction) => transaction.type === "expense",
    ).length,
    previousNetBalance,
    netChangePercent,
  };
}

export type ExpenseCategoryStat = {
  name: string;
  amount: number;
  percentage: number;
  fill: string;
};

const categoryFills = [
  "var(--chart-3)",
  "var(--chart-1)",
  "var(--chart-4)",
  "var(--chart-2)",
  "var(--chart-5)",
  "var(--chart-1)",
];

export function groupExpensesByCategory(
  transactions: Transaction[],
  categoryNames: Map<string, string>,
  monthKey: string,
): ExpenseCategoryStat[] {
  const monthExpenses = filterTransactionsByMonth(transactions, monthKey).filter(
    (transaction) => transaction.type === "expense",
  );

  const total = monthExpenses.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );

  if (total === 0) {
    return [];
  }

  const totalsByCategory = new Map<string, number>();

  for (const transaction of monthExpenses) {
    const name = transaction.categoryId
      ? (categoryNames.get(transaction.categoryId) ?? "Sem categoria")
      : "Sem categoria";

    totalsByCategory.set(
      name,
      (totalsByCategory.get(name) ?? 0) + transaction.amount,
    );
  }

  return Array.from(totalsByCategory.entries())
    .map(([name, amount], index) => ({
      name,
      amount,
      percentage: Math.round((amount / total) * 100),
      fill: categoryFills[index % categoryFills.length],
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 6);
}

export type RecentTransactionItem = {
  id: string;
  description: string;
  amount: number;
  type: Transaction["type"];
  date: string;
  categoryName: string | null;
  accountName: string | null;
};

export function getRecentTransactions(
  rows: TransactionRow[],
  limit = 5,
): RecentTransactionItem[] {
  return [...rows]
    .sort((left, right) => {
      const dateCompare = right.transaction_date.localeCompare(
        left.transaction_date,
      );

      if (dateCompare !== 0) {
        return dateCompare;
      }

      return right.created_at.localeCompare(left.created_at);
    })
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      description: row.description,
      amount: Number(row.amount),
      type: row.type,
      date: row.transaction_date,
      categoryName: row.categories?.name ?? null,
      accountName: row.accounts?.name ?? null,
    }));
}

export type MemberMonthStat = {
  userId: string;
  name: string;
  role: string;
  income: number;
  expense: number;
};

const roleLabels: Record<string, string> = {
  owner: "Responsável",
  admin: "Administrador",
  member: "Membro",
};

type FamilyMemberRow = {
  user_id: string;
  role: string;
  profiles?: {
    full_name: string | null;
    email: string | null;
  } | null;
};

export function groupByMemberForMonth(
  transactions: Transaction[],
  members: FamilyMemberRow[],
  monthKey: string,
): MemberMonthStat[] {
  const monthTransactions = filterTransactionsByMonth(transactions, monthKey);

  return members.map((member) => {
    const memberTransactions = monthTransactions.filter(
      (transaction) => transaction.createdBy === member.user_id,
    );

    return {
      userId: member.user_id,
      name:
        member.profiles?.full_name?.trim() ||
        member.profiles?.email ||
        "Membro",
      role: roleLabels[member.role] ?? member.role,
      income: sumByType(memberTransactions, "income"),
      expense: sumByType(memberTransactions, "expense"),
    };
  });
}

export type DailyCashflowPoint = {
  day: string;
  label: string;
  income: number;
  expense: number;
  net: number;
};

export type SparklinePoint = {
  index: number;
  value: number;
};

export function buildDailyCashflow(
  transactions: Transaction[],
  monthKey: string,
): DailyCashflowPoint[] {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const daysInMonth = new Date(year, month, 0).getDate();

  const byDay = new Map<number, { income: number; expense: number }>();

  for (let day = 1; day <= daysInMonth; day += 1) {
    byDay.set(day, { income: 0, expense: 0 });
  }

  for (const transaction of filterTransactionsByMonth(transactions, monthKey)) {
    const day = Number(transaction.date.slice(8, 10));
    const entry = byDay.get(day);

    if (!entry) continue;

    if (transaction.type === "income") {
      entry.income += transaction.amount;
    }

    if (transaction.type === "expense") {
      entry.expense += transaction.amount;
    }
  }

  return Array.from(byDay.entries()).map(([day, values]) => ({
    day: String(day).padStart(2, "0"),
    label: String(day),
    income: values.income,
    expense: values.expense,
    net: values.income - values.expense,
  }));
}

export function buildSparklineSeries(
  dailyPoints: DailyCashflowPoint[],
  metric: "income" | "expense" | "net",
): SparklinePoint[] {
  if (metric === "net") {
    let cumulative = 0;

    return dailyPoints.map((point, index) => {
      cumulative += point.net;
      return { index, value: cumulative };
    });
  }

  let cumulative = 0;

  return dailyPoints.map((point, index) => {
    cumulative += point[metric];
    return { index, value: cumulative };
  });
}

export type MemberParticipationStat = {
  userId: string;
  name: string;
  expense: number;
  percentage: number;
  fill: string;
};

const participationFills = [
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-2)",
];

export function buildMemberExpenseParticipation(
  members: MemberMonthStat[],
): MemberParticipationStat[] {
  const activeMembers = members.filter((member) => member.expense > 0);
  const total = activeMembers.reduce((sum, member) => sum + member.expense, 0);

  if (total === 0) {
    return [];
  }

  return activeMembers
    .map((member, index) => ({
      userId: member.userId,
      name: member.name,
      expense: member.expense,
      percentage: Math.round((member.expense / total) * 100),
      fill: participationFills[index % participationFills.length],
    }))
    .sort((left, right) => right.expense - left.expense);
}

export function getMonthExpenseShareOfYear(
  transactions: Transaction[],
  monthKey: string,
): number | null {
  const year = monthKey.slice(0, 4);
  const yearExpenses = transactions
    .filter(
      (transaction) =>
        transaction.type === "expense" &&
        transaction.date.slice(0, 4) === year,
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const monthExpenses = sumByType(
    filterTransactionsByMonth(transactions, monthKey),
    "expense",
  );

  if (yearExpenses === 0) {
    return null;
  }

  return Math.round((monthExpenses / yearExpenses) * 1000) / 10;
}
