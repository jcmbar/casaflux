import type { TransactionType } from "./transaction";

export type PredictionStatus = "predicted" | "settled" | "canceled";

export type FinancialPrediction = {
  id: string;
  recurrenceId: string | null;
  ownerUserId: string;
  familyId: string | null;
  accountId: string | null;
  categoryId: string | null;
  type: TransactionType;
  description: string;
  amount: number;
  scheduledDate: string;
  status: PredictionStatus;
  includeInProjection: boolean;
  settledTransactionId: string | null;
  settledDate: string | null;
  settledAmount: number | null;
  createdAt: string;
  updatedAt: string;
};

export type FinancialPredictionRow = {
  id: string;
  recurrence_id: string | null;
  owner_user_id: string;
  family_id: string | null;
  account_id: string | null;
  category_id: string | null;
  type: TransactionType;
  description: string;
  amount: number;
  scheduled_date: string;
  status: PredictionStatus;
  include_in_projection: boolean;
  settled_transaction_id: string | null;
  settled_date: string | null;
  settled_amount: number | null;
  created_at: string;
  updated_at: string;
};

export function mapFinancialPrediction(
  row: FinancialPredictionRow,
): FinancialPrediction {
  return {
    id: row.id,
    recurrenceId: row.recurrence_id,
    ownerUserId: row.owner_user_id,
    familyId: row.family_id,
    accountId: row.account_id,
    categoryId: row.category_id,
    type: row.type,
    description: row.description,
    amount: Number(row.amount),
    scheduledDate: row.scheduled_date,
    status: row.status,
    includeInProjection: row.include_in_projection,
    settledTransactionId: row.settled_transaction_id,
    settledDate: row.settled_date,
    settledAmount:
      row.settled_amount === null ? null : Number(row.settled_amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
