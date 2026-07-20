import { describe, expect, it } from "vitest";

import {
  RECURRENCE_END_TYPE_LABELS,
  RECURRENCE_END_TYPE_OPTIONS,
  RECURRENCE_FREQUENCY_LABELS,
  RECURRENCE_FREQUENCY_OPTIONS,
} from "./recurrence-labels";

describe("recurrence-labels", () => {
  it("covers all frequencies with product language", () => {
    expect(RECURRENCE_FREQUENCY_OPTIONS).toEqual([
      "weekly",
      "biweekly",
      "monthly",
      "yearly",
    ]);
    expect(RECURRENCE_FREQUENCY_LABELS).toEqual({
      weekly: "Toda semana",
      biweekly: "A cada 2 semanas",
      monthly: "Todo mês",
      yearly: "Todo ano",
    });
  });

  it("covers end rules including open-ended", () => {
    expect(RECURRENCE_END_TYPE_OPTIONS).toContain("never");
    expect(RECURRENCE_END_TYPE_LABELS.never).toBe("Sem data final");
  });
});
