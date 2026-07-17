import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { setRecurrenceProjection } from "./set-recurrence-projection";

describe("setRecurrenceProjection", () => {
  it("updates the recurrence and its pending predictions through the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await setRecurrenceProjection(supabase, "rec-1", true);

    expect(rpc).toHaveBeenCalledWith("set_recurrence_projection", {
      p_recurrence_id: "rec-1",
      p_include_in_projection: true,
    });
    expect(result).toEqual({ ok: true, updatedPredictions: 3 });
  });

  it("returns an error when the atomic update fails", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("denied"),
    });

    const result = await setRecurrenceProjection(
      { rpc } as unknown as SupabaseClient,
      "rec-1",
      false,
    );

    expect(result).toEqual({
      ok: false,
      message: "Não foi possível atualizar o saldo projetado.",
    });
  });
});
