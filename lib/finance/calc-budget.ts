import type { Budget } from "@/types/budget";

export function calcBudgetRemaining(budget: Budget): number {
  return budget.limit - budget.spent;
}

export function calcBudgetUsagePercent(budget: Budget): number {
  if (budget.limit === 0) return 0;
  return budget.spent / budget.limit;
}

export function isBudgetOverLimit(budget: Budget): boolean {
  return budget.spent > budget.limit;
}
