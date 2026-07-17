import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyRecurrencesChanged } from "@/lib/finance/recurrence-occurrences";

export type EndRecurrenceResult =
  | { ok: true; canceledPredictions: number }
  | { ok: false; message: string };

/**
 * Ends a recurrence: deactivates the template (no new occurrences are
 * generated) and cancels its still-pending predictions.
 *
 * Settled predictions and the real transactions they created are never
 * touched, so history is preserved.
 */
export async function endRecurrence(
  supabase: SupabaseClient,
  recurrenceId: string,
): Promise<EndRecurrenceResult> {
  const { data: updatedRecurrence, error: recurrenceError } = await supabase
    .from("transaction_recurrences")
    .update({ is_active: false })
    .eq("id", recurrenceId)
    .eq("is_active", true)
    .select("id");

  if (recurrenceError) {
    console.error(recurrenceError);
    return { ok: false, message: "Não foi possível encerrar a recorrência." };
  }

  if (!updatedRecurrence || updatedRecurrence.length === 0) {
    return {
      ok: false,
      message: "Apenas recorrências ativas podem ser encerradas.",
    };
  }

  const { data: canceledRows, error: predictionsError } = await supabase
    .from("financial_predictions")
    .update({ status: "canceled" })
    .eq("recurrence_id", recurrenceId)
    .eq("status", "predicted")
    .select("id");

  if (predictionsError) {
    console.error(predictionsError);
    notifyRecurrencesChanged();
    return {
      ok: false,
      message:
        "A recorrência foi encerrada, mas não foi possível cancelar as previsões pendentes.",
    };
  }

  notifyRecurrencesChanged();
  return { ok: true, canceledPredictions: canceledRows?.length ?? 0 };
}
