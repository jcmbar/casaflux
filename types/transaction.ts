import type { AccountType } from "@/types/account";

export type TransactionType = "income" | "expense" | "transfer";

export type Transaction = {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  categoryId: string | null;
  accountId: string;
  linkedTransactionId: string | null;
  createdBy: string | null;
  familyId: string | null;
  date: string;
  notes?: string | null;
  createdAt: string;
  /** Credit-card statement cycle id (closing date YYYY-MM-DD) for invoice payments. Legacy linkage. */
  statementCycleId: string | null;
  /**
   * Preferred invoice linkage: due date YYYY-MM-DD chosen at import/retarget.
   * When set, attribution matches `cycle.dueDate` before falling back to closing.
   */
  statementDueDate?: string | null;
  /** How an invoice payment was registered (`manual` UI vs CSV `imported`). */
  invoicePaymentOrigin?: "manual" | "imported" | null;
  /**
   * Future link between equivalent manual and imported invoice payment legs.
   * When set, settlement should not double-count both sides.
   */
  reconciledWithTransactionId?: string | null;
};

export type TransactionRow = {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  category_id: string | null;
  account_id: string;
  linked_transaction_id?: string | null;
  created_by: string | null;
  family_id: string | null;
  transaction_date: string;
  notes: string | null;
  created_at: string;
  statement_cycle_id?: string | null;
  statement_due_date?: string | null;
  invoice_payment_origin?: "manual" | "imported" | null;
  reconciled_with_transaction_id?: string | null;
  categories?: {
    id: string;
    name: string;
  } | null;
  accounts?: {
    id: string;
    name: string;
    type: AccountType;
    color?: string | null;
    is_family_shared: boolean;
  } | null;
};

export function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    type: row.type,
    categoryId: row.category_id,
    accountId: row.account_id,
    linkedTransactionId: row.linked_transaction_id ?? null,
    createdBy: row.created_by,
    familyId: row.family_id,
    date: row.transaction_date,
    notes: row.notes,
    createdAt: row.created_at,
    statementCycleId: row.statement_cycle_id ?? null,
    statementDueDate: row.statement_due_date
      ? String(row.statement_due_date).slice(0, 10)
      : null,
    invoicePaymentOrigin: row.invoice_payment_origin ?? null,
    reconciledWithTransactionId: row.reconciled_with_transaction_id ?? null,
  };
}
