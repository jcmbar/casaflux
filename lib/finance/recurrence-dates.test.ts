import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  compareIsoDates,
  enumerateOccurrenceDates,
  getOccurrenceDate,
} from "./recurrence-dates";

describe("recurrence-dates", () => {
  describe("addDaysIso", () => {
    it("adds days across month boundaries", () => {
      expect(addDaysIso("2026-01-30", 5)).toBe("2026-02-04");
    });

    it("adds days across year boundaries", () => {
      expect(addDaysIso("2026-12-30", 3)).toBe("2027-01-02");
    });
  });

  describe("compareIsoDates", () => {
    it("orders ISO dates lexicographically", () => {
      expect(compareIsoDates("2026-01-01", "2026-01-02")).toBe(-1);
      expect(compareIsoDates("2026-01-02", "2026-01-01")).toBe(1);
      expect(compareIsoDates("2026-01-01", "2026-01-01")).toBe(0);
    });
  });

  describe("getOccurrenceDate", () => {
    it("computes weekly dates", () => {
      expect(getOccurrenceDate("2026-07-01", "weekly", 0)).toBe("2026-07-01");
      expect(getOccurrenceDate("2026-07-01", "weekly", 1)).toBe("2026-07-08");
      expect(getOccurrenceDate("2026-07-01", "weekly", 4)).toBe("2026-07-29");
    });

    it("computes biweekly dates", () => {
      expect(getOccurrenceDate("2026-07-01", "biweekly", 1)).toBe("2026-07-15");
      expect(getOccurrenceDate("2026-07-01", "biweekly", 2)).toBe("2026-07-29");
    });

    it("computes monthly dates keeping the anchor day", () => {
      expect(getOccurrenceDate("2026-07-10", "monthly", 1)).toBe("2026-08-10");
      expect(getOccurrenceDate("2026-07-10", "monthly", 6)).toBe("2027-01-10");
    });

    it("clamps monthly dates to shorter months without drifting", () => {
      expect(getOccurrenceDate("2026-01-31", "monthly", 1)).toBe("2026-02-28");
      // anchor day is preserved after a clamped month
      expect(getOccurrenceDate("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    });

    it("computes yearly dates and clamps Feb 29 on non-leap years", () => {
      expect(getOccurrenceDate("2026-07-10", "yearly", 2)).toBe("2028-07-10");
      expect(getOccurrenceDate("2028-02-29", "yearly", 1)).toBe("2029-02-28");
    });

    it("rejects invalid indices", () => {
      expect(() => getOccurrenceDate("2026-07-01", "weekly", -1)).toThrow();
      expect(() => getOccurrenceDate("2026-07-01", "weekly", 1.5)).toThrow();
    });
  });

  describe("enumerateOccurrenceDates", () => {
    it("enumerates weekly dates up to the window end", () => {
      const dates = enumerateOccurrenceDates(
        {
          startDate: "2026-07-01",
          frequency: "weekly",
          endType: "never",
          endDate: null,
          occurrencesLimit: null,
        },
        "2026-07-22",
      );

      expect(dates).toEqual([
        "2026-07-01",
        "2026-07-08",
        "2026-07-15",
        "2026-07-22",
      ]);
    });

    it("stops at end_date for until_date recurrences", () => {
      const dates = enumerateOccurrenceDates(
        {
          startDate: "2026-07-01",
          frequency: "weekly",
          endType: "until_date",
          endDate: "2026-07-10",
          occurrencesLimit: null,
        },
        "2026-12-31",
      );

      expect(dates).toEqual(["2026-07-01", "2026-07-08"]);
    });

    it("stops at the limit for occurrences_count recurrences", () => {
      const dates = enumerateOccurrenceDates(
        {
          startDate: "2026-07-01",
          frequency: "monthly",
          endType: "occurrences_count",
          endDate: null,
          occurrencesLimit: 3,
        },
        "2027-12-31",
      );

      expect(dates).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
    });

    it("returns nothing when the start date is beyond the window", () => {
      const dates = enumerateOccurrenceDates(
        {
          startDate: "2027-01-01",
          frequency: "monthly",
          endType: "never",
          endDate: null,
          occurrencesLimit: null,
        },
        "2026-12-31",
      );

      expect(dates).toEqual([]);
    });
  });
});
