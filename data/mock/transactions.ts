import type { Transaction } from "@/types/transaction";

const mockDefaults = {
  createdBy: "mock-user",
  familyId: null,
} as const;

export const mockTransactions: Transaction[] = [
  {
    id: "tx-1",
    description: "Salário",
    amount: 8500,
    type: "income",
    categoryId: "cat-4",
    accountId: "acc-1",
    date: "2026-06-05",
    createdAt: "2026-06-05T09:00:00.000Z",
    ...mockDefaults,
  },
  {
    id: "tx-2",
    description: "Supermercado",
    amount: 420.5,
    type: "expense",
    categoryId: "cat-2",
    accountId: "acc-1",
    date: "2026-06-08",
    createdAt: "2026-06-08T18:30:00.000Z",
    ...mockDefaults,
  },
  {
    id: "tx-3",
    description: "Aluguel",
    amount: 2200,
    type: "expense",
    categoryId: "cat-1",
    accountId: "acc-1",
    date: "2026-06-10",
    createdAt: "2026-06-10T08:00:00.000Z",
    ...mockDefaults,
  },
];
