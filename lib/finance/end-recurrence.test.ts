import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { endRecurrence } from "./end-recurrence";

type UpdateResult = { data: { id: string }[] | null; error: Error | null };

function buildSupabaseMock(results: Record<string, UpdateResult>) {
  const updates: Record<string, unknown> = {};

  const from = vi.fn((table: string) => ({
    update: vi.fn((payload: unknown) => {
      updates[table] = payload;
      const filters: Record<string, unknown> = {};
      const builder = {
        eq: vi.fn((column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        }),
        select: vi.fn(() => Promise.resolve(results[table])),
      };
      return builder;
    }),
  }));

  return { supabase: { from } as unknown as SupabaseClient, from, updates };
}

describe("endRecurrence", () => {
  it("deactivates the recurrence and cancels pending predictions", async () => {
    const { supabase, updates } = buildSupabaseMock({
      transaction_recurrences: { data: [{ id: "rec-1" }], error: null },
      financial_predictions: {
        data: [{ id: "pred-1" }, { id: "pred-2" }],
        error: null,
      },
    });

    const result = await endRecurrence(supabase, "rec-1");

    expect(result).toEqual({ ok: true, canceledPredictions: 2 });
    expect(updates.transaction_recurrences).toEqual({ is_active: false });
    expect(updates.financial_predictions).toEqual({ status: "canceled" });
  });

  it("fails when the recurrence is not active anymore", async () => {
    const { supabase, from } = buildSupabaseMock({
      transaction_recurrences: { data: [], error: null },
      financial_predictions: { data: [], error: null },
    });

    const result = await endRecurrence(supabase, "rec-1");

    expect(result).toEqual({
      ok: false,
      message: "Apenas recorrências ativas podem ser encerradas.",
    });
    expect(from).not.toHaveBeenCalledWith("financial_predictions");
  });

  it("reports a partial failure when canceling predictions fails", async () => {
    const { supabase } = buildSupabaseMock({
      transaction_recurrences: { data: [{ id: "rec-1" }], error: null },
      financial_predictions: { data: null, error: new Error("boom") },
    });

    const result = await endRecurrence(supabase, "rec-1");

    expect(result).toEqual({
      ok: false,
      message:
        "A recorrência foi encerrada, mas não foi possível cancelar as previsões pendentes.",
    });
  });
});
