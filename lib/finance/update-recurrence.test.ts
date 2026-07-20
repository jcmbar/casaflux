import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getMonthlyProjectionDelta } from "./prediction-aggregates";
import {
  getOutdatedPendingPredictionIds,
  partitionPendingPredictionsForEdit,
  updateRecurrence,
} from "./update-recurrence";

describe("partitionPendingPredictionsForEdit", () => {
  it("keeps past pending out of edit impact", () => {
    const { past, upcoming } = partitionPendingPredictionsForEdit(
      [
        { id: "past", scheduledDate: "2026-07-01" },
        { id: "today", scheduledDate: "2026-07-20" },
        { id: "future", scheduledDate: "2026-08-01" },
      ],
      "2026-07-20",
    );

    expect(past.map((item) => item.id)).toEqual(["past"]);
    expect(upcoming.map((item) => item.id)).toEqual(["today", "future"]);
  });
});

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

  it("marks pending dates outside a reduced end date", () => {
    const outdated = getOutdatedPendingPredictionIds(
      {
        startDate: "2026-07-01",
        frequency: "monthly",
        endType: "until_date",
        endDate: "2026-07-31",
        occurrencesLimit: null,
      },
      [
        { id: "p1", scheduledDate: "2026-07-01" },
        { id: "p2", scheduledDate: "2026-08-01" },
        { id: "p3", scheduledDate: "2026-09-01" },
      ],
      { today: "2026-07-17" },
    );

    expect(outdated).toEqual(["p2", "p3"]);
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
  it("updates monthly template and only upcoming pending snapshots", async () => {
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
      updated_at: "2026-07-20T12:00:00Z",
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
      { id: "pred-past", scheduled_date: "2026-07-01" },
      { id: "pred-future", scheduled_date: "2026-08-01" },
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
      data: [{ id: "pred-future" }],
      error: null,
    });
    const pendingUpdateBuilder = {
      eq: vi.fn(),
      in: vi.fn(),
      select: pendingUpdateSelect,
    };
    pendingUpdateBuilder.eq.mockReturnValue(pendingUpdateBuilder);
    pendingUpdateBuilder.in.mockReturnValue(pendingUpdateBuilder);

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
    const updatedIdFilters: string[][] = [];

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
          return {
            ...pendingUpdateBuilder,
            in: vi.fn((column: string, ids: string[]) => {
              if (column === "id") {
                updatedIdFilters.push(ids);
              }
              return pendingUpdateBuilder;
            }),
          };
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
      { today: "2026-07-20" },
    );

    expect(result.ok).toBe(true);
    expect(predictionUpdateCalls).toBe(1);
    expect(updatedIdFilters[0]).toEqual(["pred-future"]);
    expect(snapshotUpdates[0]).toEqual(
      expect.objectContaining({
        description: "Aluguel atualizado",
        amount: 1800,
        include_in_projection: true,
      }),
    );

    if (result.ok) {
      expect(result.updatedPredictions).toBe(1);
      expect(result.canceledPredictions).toBe(0);
      expect(result.createdPredictions).toBe(0);
      expect(
        getMonthlyProjectionDelta(
          [
            {
              scheduledDate: "2026-08-01",
              amount: result.recurrence.amount,
              type: result.recurrence.type,
              status: "predicted",
              includeInProjection: result.recurrence.includeInProjection,
            },
          ],
          "2026-08",
        ),
      ).toBe(-1800);
    }
  });

  it("cancels upcoming pending outside a new end date and leaves past intact", async () => {
    const recurrenceRow = {
      id: "rec-1",
      family_id: null,
      owner_user_id: "user-1",
      account_id: "account-1",
      category_id: null,
      type: "expense",
      description: "Internet",
      amount: 100,
      frequency: "monthly",
      start_date: "2026-06-01",
      end_type: "until_date",
      end_date: "2026-07-31",
      occurrences_limit: null,
      auto_confirm: false,
      include_in_projection: true,
      is_active: true,
      created_at: "2026-06-01T12:00:00Z",
      updated_at: "2026-07-20T12:00:00Z",
    };

    const recurrenceSingle = vi
      .fn()
      .mockResolvedValue({ data: recurrenceRow, error: null });
    const recurrenceBuilder = {
      eq: vi.fn(),
      select: vi.fn(() => ({ single: recurrenceSingle })),
    };
    recurrenceBuilder.eq.mockReturnValue(recurrenceBuilder);

    const pendingRows = [
      { id: "pred-past", scheduled_date: "2026-06-01" },
      { id: "pred-aug", scheduled_date: "2026-08-01" },
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

    const canceledIds: string[][] = [];
    let updateCalls = 0;

    const from = vi.fn((table: string) => {
      if (table === "transaction_recurrences") {
        return { update: vi.fn(() => recurrenceBuilder) };
      }

      return {
        select: vi.fn(() => {
          if (updateCalls === 0) {
            return pendingListBuilder;
          }
          const existingBuilder = {
            eq: vi.fn(),
            then: (
              resolve: (value: unknown) => unknown,
              reject?: (reason: unknown) => unknown,
            ) =>
              Promise.resolve({
                data: [
                  { scheduled_date: "2026-06-01" },
                  { scheduled_date: "2026-08-01" },
                ],
                error: null,
              }).then(resolve, reject),
          };
          existingBuilder.eq.mockReturnValue(existingBuilder);
          return existingBuilder;
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updateCalls += 1;
          const builder = {
            eq: vi.fn(),
            in: vi.fn((column: string, ids: string[]) => {
              if (column === "id" && payload.status === "canceled") {
                canceledIds.push(ids);
              }
              return builder;
            }),
            select: vi.fn().mockResolvedValue({
              data:
                payload.status === "canceled"
                  ? [{ id: "pred-aug" }]
                  : [{ id: "pred-aug" }],
              error: null,
            }),
          };
          builder.eq.mockReturnValue(builder);
          return builder;
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
        categoryId: null,
        type: "expense",
        description: "Internet",
        amount: 100,
        frequency: "monthly",
        startDate: "2026-06-01",
        endType: "until_date",
        endDate: "2026-07-31",
        occurrencesLimit: null,
        autoConfirm: false,
        includeInProjection: true,
      },
      { today: "2026-07-20" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canceledPredictions).toBe(1);
      expect(canceledIds[0]).toEqual(["pred-aug"]);
      // Past pending must never appear in cancel filters.
      expect(canceledIds.flat()).not.toContain("pred-past");
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
