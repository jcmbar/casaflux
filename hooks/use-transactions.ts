import { mockTransactions } from "@/data/mock/transactions";
import type { Transaction } from "@/types/transaction";

export function useTransactions(): Transaction[] {
  return mockTransactions;
}
