export interface Budget {
  id: string;
  categoryId: string;
  month: number;
  year: number;
  limit: number;
  spent: number;
}

export type BudgetScope = {
  familyId: string | null;
  ownerUserId: string | null;
};

export function getBudgetScope({
  activeFamilyId,
  userId,
}: {
  activeFamilyId: string | null;
  userId: string;
}): BudgetScope {
  if (activeFamilyId) {
    return {
      familyId: activeFamilyId,
      ownerUserId: null,
    };
  }

  return {
    familyId: null,
    ownerUserId: userId,
  };
}

export function getGoalScope({
  activeFamilyId,
  userId,
}: {
  activeFamilyId: string | null;
  userId: string;
}): BudgetScope {
  return getBudgetScope({ activeFamilyId, userId });
}
