import type { Goal } from "@/types/goal";

export function getGoalCurrentAmount(goal: Goal): number {
  if (
    goal.progressMode === "account_balance" &&
    goal.linkedAccount != null
  ) {
    return Math.max(0, goal.linkedAccount.balance);
  }

  return goal.currentAmount;
}

export function getGoalProgressPercent(goal: Goal): number {
  if (goal.targetAmount <= 0) {
    return 0;
  }

  const current = getGoalCurrentAmount(goal);
  return Math.min(100, Math.round((current / goal.targetAmount) * 100));
}

export function isGoalAutomaticProgress(goal: Goal): boolean {
  return (
    goal.progressMode === "account_balance" && goal.linkedAccount != null
  );
}

export function getGoalProgressSourceLabel(goal: Goal): string {
  if (isGoalAutomaticProgress(goal) && goal.linkedAccount) {
    return `Saldo de ${goal.linkedAccount.name}`;
  }

  if (goal.progressMode === "account_balance" && goal.accountId) {
    return "Conta indisponível";
  }

  return "Progresso manual";
}
