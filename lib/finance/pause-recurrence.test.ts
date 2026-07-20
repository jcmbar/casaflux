import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { pauseRecurrence, resumeRecurrence } from "./pause-recurrence";
import { getRecurrenceLifecycleStatus } from "@/types/recurrence";

describe("getRecurrenceLifecycleStatus", () => {
  it("maps active, paused, and ended states", () => {
    expect(
      getRecurrenceLifecycleStatus({ isActive: true, isPaused: false }),
    ).toBe("active");
    expect(
      getRecurrenceLifecycleStatus({ isActive: true, isPaused: true }),
    ).toBe("paused");
    expect(
      getRecurrenceLifecycleStatus({ isActive: false, isPaused: false }),
    ).toBe("ended");
  });
});

describe("pauseRecurrence", () => {
  it("pauses an active recurrence and cancels only upcoming pending", async () => {
    const recurrenceUpdate = {
      eq: vi.fn(),
      select: vi.fn().mockResolvedValue({
        data: [{ id: "rec-1" }],
        error: null,
      }),
    };
    recurrenceUpdate.eq.mockReturnValue(recurrenceUpdate);

    const pendingList = {
      eq: vi.fn(),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve({
          data: [
            { id: "pred-past", scheduled_date: "2026-07-01" },
            { id: "pred-future", scheduled_date: "2026-08-01" },
          ],
          error: null,
        }).then(resolve, reject),
    };
    pendingList.eq.mockReturnValue(pendingList);

    const canceledIds: string[][] = [];
    const from = vi.fn((table: string) => {
      if (table === "transaction_recurrences") {
        return {
          update: vi.fn((payload: unknown) => {
            expect(payload).toEqual({ is_paused: true });
            return recurrenceUpdate;
          }),
        };
      }

      return {
        select: vi.fn(() => pendingList),
        update: vi.fn((payload: unknown) => {
          expect(payload).toEqual({ status: "canceled" });
          const builder = {
            in: vi.fn((column: string, ids: string[]) => {
              if (column === "id") canceledIds.push(ids);
              return builder;
            }),
            eq: vi.fn(() => builder),
            select: vi.fn().mockResolvedValue({
              data: [{ id: "pred-future" }],
              error: null,
            }),
          };
          return builder;
        }),
      };
    });

    const result = await pauseRecurrence(
      { from } as unknown as SupabaseClient,
      "rec-1",
      { today: "2026-07-20" },
    );

    expect(result).toEqual({ ok: true, canceledUpcomingPredictions: 1 });
    expect(canceledIds[0]).toEqual(["pred-future"]);
    expect(canceledIds.flat()).not.toContain("pred-past");
  });

  it("rejects when the recurrence is not an active unpaused template", async () => {
    const recurrenceUpdate = {
      eq: vi.fn(),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    recurrenceUpdate.eq.mockReturnValue(recurrenceUpdate);

    const from = vi.fn(() => ({
      update: vi.fn(() => recurrenceUpdate),
    }));

    const result = await pauseRecurrence(
      { from } as unknown as SupabaseClient,
      "rec-1",
    );

    expect(result).toEqual({
      ok: false,
      message: "Apenas recorrências ativas (não pausadas) podem ser pausadas.",
    });
  });
});

describe("resumeRecurrence", () => {
  it("resumes a paused recurrence and regenerates upcoming predictions", async () => {
    const recurrenceRow = {
      id: "rec-1",
      family_id: null,
      owner_user_id: "user-1",
      account_id: "account-1",
      category_id: null,
      type: "expense",
      description: "Aluguel",
      amount: 1500,
      frequency: "monthly",
      start_date: "2026-07-01",
      end_type: "never",
      end_date: null,
      occurrences_limit: null,
      auto_confirm: false,
      include_in_projection: true,
      is_active: true,
      is_paused: false,
      created_at: "2026-07-01T12:00:00Z",
      updated_at: "2026-07-20T12:00:00Z",
    };

    const recurrenceUpdate = {
      eq: vi.fn(),
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: recurrenceRow, error: null }),
      })),
    };
    recurrenceUpdate.eq.mockReturnValue(recurrenceUpdate);

    const existingDatesBuilder = {
      eq: vi.fn(),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve({
          data: [{ scheduled_date: "2026-07-01" }],
          error: null,
        }).then(resolve, reject),
    };
    existingDatesBuilder.eq.mockReturnValue(existingDatesBuilder);

    const insertedDates: string[] = [];
    const from = vi.fn((table: string) => {
      if (table === "transaction_recurrences") {
        return {
          update: vi.fn((payload: unknown) => {
            expect(payload).toEqual({ is_paused: false });
            return recurrenceUpdate;
          }),
        };
      }

      return {
        select: vi.fn(() => existingDatesBuilder),
        insert: vi.fn((rows: Array<{ scheduled_date: string }>) => {
          insertedDates.push(...rows.map((row) => row.scheduled_date));
          return Promise.resolve({ error: null });
        }),
      };
    });

    const result = await resumeRecurrence(
      { from } as unknown as SupabaseClient,
      "rec-1",
      { today: "2026-07-20" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recurrence.isPaused).toBe(false);
      expect(result.createdPredictions).toBeGreaterThan(0);
      expect(insertedDates).toContain("2026-08-01");
      expect(insertedDates).not.toContain("2026-07-01");
    }
  });
});
