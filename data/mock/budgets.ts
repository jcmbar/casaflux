import type { Budget } from "@/types/budget";

export const mockBudgets: Budget[] = [
  {
    id: "bud-1",
    categoryId: "cat-1",
    month: 6,
    year: 2026,
    limit: 2500,
    spent: 2200,
  },
  {
    id: "bud-2",
    categoryId: "cat-2",
    month: 6,
    year: 2026,
    limit: 1200,
    spent: 680,
  },
  {
    id: "bud-3",
    categoryId: "cat-3",
    month: 6,
    year: 2026,
    limit: 600,
    spent: 310,
  },
];
