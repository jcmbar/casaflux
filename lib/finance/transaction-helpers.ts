import type { Transaction, TransactionType } from "@/types/transaction";

export function isIncome(transaction: Transaction): boolean {
  return transaction.type === "income";
}

export function isExpense(transaction: Transaction): boolean {
  return transaction.type === "expense";
}

export function isTransfer(transaction: Transaction): boolean {
  return transaction.type === "transfer";
}

export function filterByType(
  transactions: Transaction[],
  type: TransactionType,
): Transaction[] {
  return transactions.filter((transaction) => transaction.type === type);
}

export function filterByMonth(
  transactions: Transaction[],
  year: number,
  month: number,
): Transaction[] {
  return transactions.filter((transaction) => {
    const date = new Date(transaction.date);
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  });
}

export function filterByAccount(
  transactions: Transaction[],
  accountId: string,
): Transaction[] {
  return transactions.filter(
    (transaction) => transaction.accountId === accountId,
  );
}

export function sumTransactions(transactions: Transaction[]): number {
  return transactions.reduce((total, transaction) => {
    if (transaction.type === "income") return total + transaction.amount;
    if (transaction.type === "expense") return total - transaction.amount;
    return total;
  }, 0);
}
