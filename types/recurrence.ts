import type { TransactionType } from "./transaction";

export type RecurrenceFrequency = "weekly" | "biweekly" | "monthly" | "yearly";

export type RecurrenceEndType = "never" | "until_date" | "occurrences_count";

export type TransactionRecurrence = {
  id: string;
  familyId: string | null;
  ownerUserId: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  description: string;
  amount: number;
  frequency: RecurrenceFrequency;
  startDate: string;
  endType: RecurrenceEndType;
  endDate: string | null;
  occurrencesLimit: number | null;
  autoConfirm: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TransactionRecurrenceRow = {
  id: string;
  family_id: string | null;
  owner_user_id: string;
  account_id: string;
  category_id: string | null;
  type: TransactionType;
  description: string;
  amount: number;
  frequency: RecurrenceFrequency;
  start_date: string;
  end_type: RecurrenceEndType;
  end_date: string | null;
  occurrences_limit: number | null;
  auto_confirm: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function mapTransactionRecurrence(
  row: TransactionRecurrenceRow,
): TransactionRecurrence {
  return {
    id: row.id,
    familyId: row.family_id,
    ownerUserId: row.owner_user_id,
    accountId: row.account_id,
    categoryId: row.category_id,
    type: row.type,
    description: row.description,
    amount: Number(row.amount),
    frequency: row.frequency,
    startDate: row.start_date,
    endType: row.end_type,
    endDate: row.end_date,
    occurrencesLimit: row.occurrences_limit,
    autoConfirm: row.auto_confirm,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
