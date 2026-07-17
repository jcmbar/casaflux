import type { SupabaseClient } from "@supabase/supabase-js";

import { syncPredictedOccurrences } from "@/lib/finance/recurrence-occurrences";
import {
  mapTransactionRecurrence,
  type RecurrenceEndType,
  type RecurrenceFrequency,
  type TransactionRecurrence,
  type TransactionRecurrenceRow,
} from "@/types/recurrence";
import type { TransactionType } from "@/types/transaction";

export type CreateRecurrenceInput = {
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
};

export type CreateRecurrenceResult =
  | {
      ok: true;
      recurrence: TransactionRecurrence;
      occurrencesCreated: number;
    }
  | { ok: false; message: string };

export async function createRecurrence(
  supabase: SupabaseClient,
  input: CreateRecurrenceInput,
): Promise<CreateRecurrenceResult> {
  const { data, error } = await supabase
    .from("transaction_recurrences")
    .insert({
      family_id: input.familyId,
      owner_user_id: input.ownerUserId,
      account_id: input.accountId,
      category_id: input.categoryId,
      type: input.type,
      description: input.description,
      amount: input.amount,
      frequency: input.frequency,
      start_date: input.startDate,
      end_type: input.endType,
      end_date: input.endType === "until_date" ? input.endDate : null,
      occurrences_limit:
        input.endType === "occurrences_count"
          ? input.occurrencesLimit
          : null,
      auto_confirm: input.autoConfirm,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error(error);
    return {
      ok: false,
      message: "Não foi possível salvar a recorrência.",
    };
  }

  const recurrence = mapTransactionRecurrence(
    data as TransactionRecurrenceRow,
  );
  const syncResult = await syncPredictedOccurrences(supabase, recurrence);

  if (!syncResult.ok) {
    const { error: rollbackError } = await supabase
      .from("transaction_recurrences")
      .delete()
      .eq("id", recurrence.id);

    if (rollbackError) {
      console.error(rollbackError);
    }

    return syncResult;
  }

  return {
    ok: true,
    recurrence,
    occurrencesCreated: syncResult.created,
  };
}
