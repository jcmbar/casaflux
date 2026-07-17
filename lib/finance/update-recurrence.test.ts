import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getMonthlyProjectionDelta } from "./prediction-aggregates";
import {
  getOutdatedPendingPredictionIds,
  updateRecurrence,
} from "./update-recurrence";

describe("getOutdatedPendingPredictionIds", () => {
  it("keeps pending dates that still match the schedule", () => {
    const outdated = getOutdatedPendingPredictionIds(
      {
        startDate: "2026-07-01",
        frequency: "monthly",
        endType: "never",
        endDate: null,
        occurrencesLimit: null,
      },
      [
        { id: "p1", scheduledDate: "2026-07-01" },
        { id: "p2", scheduledDate: "2026-08-01" },
      ],
      { today: "2026-07-17" },
    );

    expect(outdated).toEqual([]);
  });

  it("marks pending dates outside a reduced occurrences limit", () => {
    const outdated = getOutdatedPendingPredictionIds(
      {
        startDate: "2026-07-01",
        frequency: "monthly",
        endType: "occurrences_count",
        endDate: null,
        occurrencesLimit: 1,
      },
      [
        { id: "p1", scheduledDate: "2026-07-01" },
        { id: "p2", scheduledDate: "2026-08-01" },
      ],
      { today: "2026-07-17" },
    );

    expect(outdated).toEqual(["p2"]);
  });
});

describe("updateRecurrence", () => {
  it("updates the template, pending snapshots and projection consistency", async () => {
    const recurrenceRow = {
      id: "rec-1",
      family_id: null,
      owner_user_id: "user-1",
      account_id: "account-1",
      category_id: "category-1",
      type: "expense",
      description: "Aluguel atualizado",
      amount: 1800,
      frequency: "monthly",
      start_date: "2026-07-01",
      end_type: "never",
      end_date: null,
      occurrences_limit: null,
      auto_confirm: false,
      include_in_projection: true,
      is_active: true,
      created_at: "2026-07-01T12:00:00Z",
      updated_at: "2026-07-17T12:00:00Z",
    };

    const recurrenceSingle = vi
      .fn()
      .mockResolvedValue({ data: recurrenceRow, error: null });
    const recurrenceSelect = vi.fn(() => ({ single: recurrenceSingle }));
    const recurrenceBuilder = {
      eq: vi.fn(),
      select: recurrenceSelect,
    };
    recurrenceBuilder.eq.mockReturnValue(recurrenceBuilder);

    const pendingRows = [
      { id: "pred-1", scheduled_date: "2026-07-01" },
      { id: "pred-2", scheduled_date: "2026-08-01" },
    ];
    const pendingListBuilder = {
      eq: vi.fn(),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve({ data: pendingRows, error: null }).then(
          resolve,
          reject,
        ),
    };
    pendingListBuilder.eq.mockReturnValue(pendingListBuilder);

    const pendingUpdateSelect = vi.fn().mockResolvedValue({
      data: [{ id: "pred-1" }, { id: "pred-2" }],
      error: null,
    });
    const pendingUpdateBuilder = {
      eq: vi.fn(),
      select: pendingUpdateSelect,
    };
    pendingUpdateBuilder.eq.mockReturnValue(pendingUpdateBuilder);

    const existingDates = [
      { scheduled_date: "2026-07-01" },
      { scheduled_date: "2026-08-01" },
      { scheduled_date: "2026-09-01" },
      { scheduled_date: "2026-10-01" },
    ];
    const existingDatesBuilder = {
      eq: vi.fn(),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve({ data: existingDates, error: null }).then(
          resolve,
          reject,
        ),
    };
    existingDatesBuilder.eq.mockReturnValue(existingDatesBuilder);

    let predictionSelectCalls = 0;
    let predictionUpdateCalls = 0;
    const snapshotUpdates: Record<string, unknown>[] = [];

    const from = vi.fn((table: string) => {
      if (table === "transaction_recurrences") {
        return {
          update: vi.fn(() => recurrenceBuilder),
        };
      }

      return {
        select: vi.fn(() => {
          predictionSelectCalls += 1;
          if (predictionSelectCalls === 1) {
            return pendingListBuilder;
          }
          return existingDatesBuilder;
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          predictionUpdateCalls += 1;
          snapshotUpdates.push(payload);
          return pendingUpdateBuilder;
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const result = await updateRecurrence(
      { from } as unknown as SupabaseClient,
      {
        recurrenceId: "rec-1",
        familyId: null,
        accountId: "account-1",
        categoryId: "category-1",
        type: "expense",
        description: "  Aluguel atualizado  ",
        amount: 1800,
        frequency: "monthly",
        startDate: "2026-07-01",
        endType: "never",
        endDate: null,
        occurrencesLimit: null,
        autoConfirm: false,
        includeInProjection: true,
      },
    );

    expect(result.ok).toBe(true);
    expect(predictionUpdateCalls).toBe(1);
    expect(snapshotUpdates[0]).toEqual(
      expect.objectContaining({
        description: "Aluguel atualizado",
        amount: 1800,
        include_in_projection: true,
      }),
    );

    if (result.ok) {
      expect(result.updatedPredictions).toBe(2);
      expect(result.canceledPredictions).toBe(0);
      expect(result.createdPredictions).toBe(0);
      expect(
        getMonthlyProjectionDelta(
          [
            {
              scheduledDate: "2026-07-01",
              amount: result.recurrence.amount,
              type: result.recurrence.type,
              status: "predicted",
              includeInProjection: result.recurrence.includeInProjection,
            },
          ],
          "2026-07",
        ),
      ).toBe(-1800);
    }
  });

  it("rejects invalid input before accessing Supabase", async () => {
    const from = vi.fn();
    const result = await updateRecurrence(
      { from } as unknown as SupabaseClient,
      {
        recurrenceId: "rec-1",
        familyId: null,
        accountId: "account-1",
        categoryId: null,
        type: "expense",
        description: " ",
        amount: 0,
        frequency: "monthly",
        startDate: "2026-07-01",
        endType: "never",
        endDate: null,
        occurrencesLimit: null,
        autoConfirm: false,
        includeInProjection: true,
      },
    );

    expect(result).toEqual({
      ok: false,
      message: "Informe uma descrição para a recorrência.",
    });
    expect(from).not.toHaveBeenCalled();
  });
});
