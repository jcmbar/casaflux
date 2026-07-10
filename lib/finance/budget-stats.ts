import {
  filterTransactionsByMonth,
  sumByType,
} from "@/lib/finance/dashboard-stats";
import type { Budget } from "@/types/budget";
import type { Transaction } from "@/types/transaction";

export type CategoryBudgetRow = {
  id: string;
  family_id: string | null;
  owner_user_id: string | null;
  category_id: string;
  month_key: string;
  amount_limit: number;
  created_at: string;
  updated_at: string;
};

export type BudgetCategoryStat = {
  categoryId: string;
  categoryName: string;
  limit: number;
  spent: number;
  available: number;
  percent: number;
  budgetId: string | null;
  hasLimit: boolean;
};

export function mapCategoryBudget(row: CategoryBudgetRow): Budget {
  const [yearStr, monthStr] = row.month_key.split("-");

  return {
    id: row.id,
    categoryId: row.category_id,
    month: Number(monthStr),
    year: Number(yearStr),
    limit: Number(row.amount_limit),
    spent: 0,
  };
}

export function computeSpentByCategory(
  transactions: Transaction[],
  monthKey: string,
) {
  const monthExpenses = filterTransactionsByMonth(transactions, monthKey).filter(
    (transaction) => transaction.type === "expense",
  );

  const totals = new Map<string, number>();

  for (const transaction of monthExpenses) {
    if (!transaction.categoryId) continue;

    totals.set(
      transaction.categoryId,
      (totals.get(transaction.categoryId) ?? 0) + transaction.amount,
    );
  }

  return totals;
}

export function buildBudgetCategoryStats({
  budgets,
  transactions,
  monthKey,
  categoryNames,
}: {
  budgets: Budget[];
  transactions: Transaction[];
  monthKey: string;
  categoryNames: Map<string, string>;
}): BudgetCategoryStat[] {
  const spentByCategory = computeSpentByCategory(transactions, monthKey);
  const budgetByCategory = new Map(
    budgets.map((budget) => [budget.categoryId, budget]),
  );
  const categoryIds = new Set<string>([
    ...budgetByCategory.keys(),
    ...spentByCategory.keys(),
  ]);

  return Array.from(categoryIds)
    .map((categoryId) => {
      const budget = budgetByCategory.get(categoryId);
      const spent = spentByCategory.get(categoryId) ?? 0;
      const limit = budget?.limit ?? 0;
      const hasLimit = Boolean(budget);
      const available = hasLimit ? limit - spent : 0;
      const percent = hasLimit && limit > 0 ? Math.round((spent / limit) * 100) : 0;

      return {
        categoryId,
        categoryName: categoryNames.get(categoryId) ?? "Categoria",
        limit,
        spent,
        available,
        percent: Math.min(percent, 100),
        budgetId: budget?.id ?? null,
        hasLimit,
      };
    })
    .sort((left, right) => {
      if (left.hasLimit !== right.hasLimit) {
        return left.hasLimit ? -1 : 1;
      }

      return right.spent - left.spent;
    });
}

export function buildBudgetSummary(stats: BudgetCategoryStat[]) {
  const limitedStats = stats.filter((stat) => stat.hasLimit);
  const totalLimit = limitedStats.reduce((sum, stat) => sum + stat.limit, 0);
  const totalSpentOnBudgeted = limitedStats.reduce(
    (sum, stat) => sum + stat.spent,
    0,
  );
  const totalSpent = stats.reduce((sum, stat) => sum + stat.spent, 0);

  return {
    totalLimit,
    totalSpentOnBudgeted,
    totalSpent,
    totalAvailable: totalLimit - totalSpentOnBudgeted,
  };
}

export function getMonthExpenseTotal(
  transactions: Transaction[],
  monthKey: string,
) {
  const monthTransactions = filterTransactionsByMonth(transactions, monthKey);
  return sumByType(monthTransactions, "expense");
}
