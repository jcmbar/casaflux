import { mockBudgets } from "@/data/mock/budgets";
import { calcBudgetRemaining, calcBudgetUsagePercent } from "@/lib/finance/calc-budget";
import type { Budget } from "@/types/budget";

export type BudgetSummary = Budget & {
  remaining: number;
  usagePercent: number;
};

export function useBudgetSummary(): BudgetSummary[] {
  return mockBudgets.map((budget) => ({
    ...budget,
    remaining: calcBudgetRemaining(budget),
    usagePercent: calcBudgetUsagePercent(budget),
  }));
}
