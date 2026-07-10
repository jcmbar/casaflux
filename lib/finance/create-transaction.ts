import type { SupabaseClient } from "@supabase/supabase-js";

import { adjustAccountBalance, getTransactionBalanceDelta } from "@/lib/finance/account-balance";
import type { TransactionType } from "@/types/transaction";

export type CreateTransactionInput = {
  description: string;
  amount: number;
  type: TransactionType;
  categoryId: string | null;
  accountId: string;
  transactionDate: string;
  userId: string;
  familyId: string | null;
};

export type CreateTransactionResult =
  | { ok: true }
  | { ok: false; message: string };

export function notifyTransactionsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("casaflux:transactions-changed"));
  }
}

export async function createTransaction(
  supabase: SupabaseClient,
  input: CreateTransactionInput,
): Promise<CreateTransactionResult> {
  const { error } = await supabase.from("transactions").insert({
    description: input.description,
    amount: input.amount,
    type: input.type,
    category_id: input.categoryId,
    account_id: input.accountId,
    transaction_date: input.transactionDate,
    created_by: input.userId,
    family_id: input.familyId,
  });

  if (error) {
    console.error(error);
    return { ok: false, message: "Não foi possível salvar o lançamento." };
  }

  try {
    await adjustAccountBalance(supabase, {
      accountId: input.accountId,
      delta: getTransactionBalanceDelta(input.type, input.amount),
    });
  } catch (balanceError) {
    console.error(balanceError);
  }

  notifyTransactionsChanged();
  return { ok: true };
}
