import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyRecurrencesChanged } from "@/lib/finance/recurrence-occurrences";

export type SetRecurrenceProjectionResult =
  | { ok: true; updatedPredictions: number }
  | { ok: false; message: string };

export async function setRecurrenceProjection(
  supabase: SupabaseClient,
  recurrenceId: string,
  includeInProjection: boolean,
): Promise<SetRecurrenceProjectionResult> {
  const { data, error } = await supabase.rpc("set_recurrence_projection", {
    p_recurrence_id: recurrenceId,
    p_include_in_projection: includeInProjection,
  });

  if (error || typeof data !== "number") {
    console.error(error);
    return {
      ok: false,
      message: "Não foi possível atualizar o saldo projetado.",
    };
  }

  notifyRecurrencesChanged();
  return { ok: true, updatedPredictions: data };
}
