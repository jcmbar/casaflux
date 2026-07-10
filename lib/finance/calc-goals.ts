import type { Goal } from "@/types/goal";

import { getGoalCurrentAmount } from "./goal-progress";

export function calcGoalProgress(goal: Goal): number {
  if (goal.targetAmount === 0) return 0;
  return getGoalCurrentAmount(goal) / goal.targetAmount;
}

export function calcGoalRemaining(goal: Goal): number {
  return Math.max(goal.targetAmount - getGoalCurrentAmount(goal), 0);
}

export function isGoalCompleted(goal: Goal): boolean {
  return getGoalCurrentAmount(goal) >= goal.targetAmount;
}
