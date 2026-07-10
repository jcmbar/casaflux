import type { SupabaseClient } from "@supabase/supabase-js";

import type { TransactionType } from "@/types/transaction";

export function getTransactionBalanceDelta(
  type: TransactionType,
  amount: number,
): number {
  if (type === "income") {
    return amount;
  }

  if (type === "expense") {
    return -amount;
  }

  return 0;
}

export async function adjustAccountBalance(
  supabase: SupabaseClient,
  {
    accountId,
    delta,
  }: {
    accountId: string;
    delta: number;
  },
) {
  if (delta === 0) {
    return;
  }

  const { data: account, error: readError } = await supabase
    .from("accounts")
    .select("balance")
    .eq("id", accountId)
    .maybeSingle();

  if (readError || !account) {
    throw readError ?? new Error("Conta não encontrada para atualizar saldo.");
  }

  const { error: updateError } = await supabase
    .from("accounts")
    .update({ balance: Number(account.balance) + delta })
    .eq("id", accountId);

  if (updateError) {
    throw updateError;
  }
}
