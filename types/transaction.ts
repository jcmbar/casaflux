export type TransactionType = "income" | "expense" | "transfer";

export type Transaction = {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  categoryId: string | null;
  accountId: string;
  createdBy: string | null;
  familyId: string | null;
  date: string;
  notes?: string | null;
  createdAt: string;
};

export type TransactionRow = {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  category_id: string | null;
  account_id: string;
  created_by: string | null;
  family_id: string | null;
  transaction_date: string;
  notes: string | null;
  created_at: string;
  categories?: {
    id: string;
    name: string;
  } | null;
  accounts?: {
    id: string;
    name: string;
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
    createdBy: row.created_by,
    familyId: row.family_id,
    date: row.transaction_date,
    notes: row.notes,
    createdAt: row.created_at,
  };
}
