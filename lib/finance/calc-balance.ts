import type { Transaction } from "@/types/transaction";
import { sumTransactions } from "./transaction-helpers";

export function calcBalance(transactions: Transaction[]): number {
  return sumTransactions(transactions);
}

export function calcIncomeTotal(transactions: Transaction[]): number {
  return transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function calcExpenseTotal(transactions: Transaction[]): number {
  return transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((total, transaction) => total + transaction.amount, 0);
}
