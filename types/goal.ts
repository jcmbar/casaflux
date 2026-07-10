import { getGoalCurrentAmount } from "@/lib/finance/goal-progress";

export type GoalStatus = "active" | "completed" | "paused";
export type GoalProgressMode = "manual" | "account_balance";

export type GoalLinkedAccount = {
  id: string;
  name: string;
  balance: number;
};

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  status: GoalStatus;
  progressMode: GoalProgressMode;
  accountId: string | null;
  linkedAccount: GoalLinkedAccount | null;
}

export type FinancialGoalRow = {
  id: string;
  family_id: string | null;
  owner_user_id: string | null;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  status: GoalStatus;
  progress_mode: GoalProgressMode;
  account_id: string | null;
  created_at: string;
  updated_at: string;
  accounts?: {
    id: string;
    name: string;
    balance: number;
  } | null;
};

export const GOALS_SELECT = `
  *,
  accounts (
    id,
    name,
    balance
  )
`;

export function mapFinancialGoal(row: FinancialGoalRow): Goal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: Number(row.target_amount),
    currentAmount: Number(row.current_amount),
    deadline: row.deadline ?? undefined,
    status: row.status,
    progressMode: row.progress_mode ?? "manual",
    accountId: row.account_id,
    linkedAccount: row.accounts
      ? {
          id: row.accounts.id,
          name: row.accounts.name,
          balance: Number(row.accounts.balance),
        }
      : null,
  };
}

export function enrichGoalWithScopedAccount(
  goal: Goal,
  scopedAccounts: Array<{ id: string; name: string; balance: number }>,
): Goal {
  if (goal.progressMode !== "account_balance" || !goal.accountId) {
    return goal;
  }

  const account = scopedAccounts.find((item) => item.id === goal.accountId);

  if (!account) {
    return {
      ...goal,
      linkedAccount: null,
    };
  }

  return {
    ...goal,
    linkedAccount: {
      id: account.id,
      name: account.name,
      balance: Number(account.balance),
    },
  };
}

export function buildGoalsSummary(goals: Goal[]) {
  const totalTarget = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const totalSaved = goals.reduce(
    (sum, goal) => sum + getGoalCurrentAmount(goal),
    0,
  );
  const overallProgress =
    totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

  return {
    totalTarget,
    totalSaved,
    overallProgress,
  };
}
