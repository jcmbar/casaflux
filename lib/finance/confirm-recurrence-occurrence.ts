import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyTransactionsChanged } from "@/lib/finance/create-transaction";
import { notifyRecurrencesChanged } from "@/lib/finance/recurrence-occurrences";

export type ConfirmOccurrenceResult =
  | { ok: true; transactionId: string }
  | { ok: false; message: string };

export async function confirmRecurrenceOccurrence(
  supabase: SupabaseClient,
  occurrenceId: string,
): Promise<ConfirmOccurrenceResult> {
  const { data, error } = await supabase.rpc(
    "confirm_recurrence_occurrence",
    {
      p_occurrence_id: occurrenceId,
    },
  );

  if (error || typeof data !== "string") {
    console.error(error);
    return {
      ok: false,
      message: "Não foi possível confirmar a ocorrência.",
    };
  }

  notifyTransactionsChanged();
  notifyRecurrencesChanged();

  return { ok: true, transactionId: data };
}
