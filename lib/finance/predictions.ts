import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyTransactionsChanged } from "@/lib/finance/create-transaction";
import { notifyRecurrencesChanged } from "@/lib/finance/recurrence-occurrences";
import {
  mapFinancialPrediction,
  type FinancialPrediction,
  type FinancialPredictionRow,
} from "@/types/prediction";
import type { TransactionType } from "@/types/transaction";

export type CreatePredictionInput = {
  ownerUserId: string;
  familyId: string | null;
  /** Expected account (optional until settlement). */
  accountId: string | null;
  categoryId: string | null;
  type: Exclude<TransactionType, "transfer">;
  description: string;
  amount: number;
  scheduledDate: string;
};

export type CreatePredictionResult =
  | { ok: true; prediction: FinancialPrediction }
  | { ok: false; message: string };

export function getCreatePredictionValidationError(
  input: Pick<
    CreatePredictionInput,
    "description" | "amount" | "scheduledDate"
  >,
): string | null {
  if (!input.description.trim()) {
    return "Informe uma descrição para a previsão.";
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return "Informe um valor previsto maior que zero.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) {
    return "Informe uma data agendada válida.";
  }

  return null;
}

/** Creates a standalone prediction (not linked to a recurrence). */
export async function createPrediction(
  supabase: SupabaseClient,
  input: CreatePredictionInput,
): Promise<CreatePredictionResult> {
  const validationError = getCreatePredictionValidationError(input);

  if (validationError) {
    return { ok: false, message: validationError };
  }

  const { data, error } = await supabase
    .from("financial_predictions")
    .insert({
      recurrence_id: null,
      owner_user_id: input.ownerUserId,
      family_id: input.familyId,
      account_id: input.accountId,
      category_id: input.categoryId,
      type: input.type,
      description: input.description.trim(),
      amount: input.amount,
      scheduled_date: input.scheduledDate,
      status: "predicted",
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error(error);
    return { ok: false, message: "Não foi possível salvar a previsão." };
  }

  notifyRecurrencesChanged();
  return {
    ok: true,
    prediction: mapFinancialPrediction(data as FinancialPredictionRow),
  };
}

export type SettlePredictionInput = {
  predictionId: string;
  /** Real account used for the payment/receipt. */
  accountId: string;
  /** Real payment/receipt date (ISO "YYYY-MM-DD"). */
  settledDate: string;
  /** Real amount; defaults to the predicted amount when omitted. */
  amount?: number;
};

export type SettlePredictionResult =
  | { ok: true; transactionId: string }
  | { ok: false; message: string };

/**
 * Settles a predicted entry: atomically creates the real transaction,
 * adjusts the account balance and links the prediction to it
 * (via the settle_financial_prediction database function).
 */
export async function settlePrediction(
  supabase: SupabaseClient,
  input: SettlePredictionInput,
): Promise<SettlePredictionResult> {
  const { data, error } = await supabase.rpc("settle_financial_prediction", {
    p_prediction_id: input.predictionId,
    p_account_id: input.accountId,
    p_settled_date: input.settledDate,
    p_amount: input.amount ?? null,
  });

  if (error || typeof data !== "string") {
    console.error(error);
    return { ok: false, message: "Não foi possível liquidar a previsão." };
  }

  notifyTransactionsChanged();
  notifyRecurrencesChanged();

  return { ok: true, transactionId: data };
}

export type CancelPredictionResult =
  | { ok: true }
  | { ok: false; message: string };

/** Cancels a predicted entry; no real transaction is created. */
export async function cancelPrediction(
  supabase: SupabaseClient,
  predictionId: string,
): Promise<CancelPredictionResult> {
  const { data, error } = await supabase
    .from("financial_predictions")
    .update({ status: "canceled" })
    .eq("id", predictionId)
    .eq("status", "predicted")
    .select("id");

  if (error) {
    console.error(error);
    return { ok: false, message: "Não foi possível cancelar a previsão." };
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "Apenas previsões pendentes podem ser canceladas.",
    };
  }

  notifyRecurrencesChanged();
  return { ok: true };
}
