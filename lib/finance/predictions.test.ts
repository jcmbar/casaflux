import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getMonthlyPredictionAggregates } from "./prediction-aggregates";
import {
  createPrediction,
  getCreatePredictionValidationError,
} from "./predictions";

describe("createPrediction", () => {
  it("creates a standalone pending prediction and feeds monthly aggregates", async () => {
    const row = {
      id: "prediction-1",
      recurrence_id: null,
      owner_user_id: "user-1",
      family_id: null,
      account_id: null,
      category_id: null,
      type: "expense",
      description: "Seguro anual",
      amount: 120,
      scheduled_date: "2026-07-25",
      status: "predicted",
      settled_transaction_id: null,
      settled_date: null,
      settled_amount: null,
      created_at: "2026-07-17T12:00:00Z",
      updated_at: "2026-07-17T12:00:00Z",
    };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const supabase = { from } as unknown as SupabaseClient;

    const result = await createPrediction(supabase, {
      ownerUserId: "user-1",
      familyId: null,
      accountId: null,
      categoryId: null,
      type: "expense",
      description: "  Seguro anual  ",
      amount: 120,
      scheduledDate: "2026-07-25",
    });

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence_id: null,
        description: "Seguro anual",
        status: "predicted",
      }),
    );

    if (result.ok) {
      expect(
        getMonthlyPredictionAggregates([result.prediction], "2026-07"),
      ).toEqual({
        predicted: 120,
        realized: 0,
        delta: -120,
      });
    }
  });

  it("rejects invalid input before accessing Supabase", async () => {
    const from = vi.fn();
    const result = await createPrediction(
      { from } as unknown as SupabaseClient,
      {
        ownerUserId: "user-1",
        familyId: null,
        accountId: null,
        categoryId: null,
        type: "income",
        description: " ",
        amount: 0,
        scheduledDate: "",
      },
    );

    expect(result).toEqual({
      ok: false,
      message: "Informe uma descrição para a previsão.",
    });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("getCreatePredictionValidationError", () => {
  it("validates amount and scheduled date", () => {
    expect(
      getCreatePredictionValidationError({
        description: "IPVA",
        amount: 0,
        scheduledDate: "2026-07-20",
      }),
    ).toBe("Informe um valor previsto maior que zero.");

    expect(
      getCreatePredictionValidationError({
        description: "IPVA",
        amount: 100,
        scheduledDate: "20/07/2026",
      }),
    ).toBe("Informe uma data agendada válida.");
  });
});
