import { describe, expect, it } from "vitest";

import {
  parseNubankStatementPeriodFromText,
  resolveNubankStatementPeriod,
} from "./statement-period";

describe("parseNubankStatementPeriodFromText", () => {
  it("parses Período DD/MM a DD/MM with year wrap", () => {
    expect(
      parseNubankStatementPeriodFromText("Período 20/12 a 18/01", 2025),
    ).toEqual({
      start: "2025-12-20",
      end: "2026-01-18",
      source: "explicit_text",
    });
  });

  it("parses full years", () => {
    expect(
      parseNubankStatementPeriodFromText(
        "Periodo 20/04/2026 até 18/05/2026",
      ),
    ).toEqual({
      start: "2026-04-20",
      end: "2026-05-18",
      source: "explicit_text",
    });
  });
});

describe("resolveNubankStatementPeriod", () => {
  it("prefers explicit text over row dates", () => {
    expect(
      resolveNubankStatementPeriod({
        rows: [
          { date: "2026-04-25" },
          { date: "2026-05-10" },
        ],
        textSources: ["Fatura — Período 20/04 a 18/05"],
        fallbackYear: 2026,
      }),
    ).toEqual({
      start: "2026-04-20",
      end: "2026-05-18",
      source: "explicit_text",
    });
  });

  it("falls back to min/max row dates", () => {
    expect(
      resolveNubankStatementPeriod({
        rows: [
          { date: "2026-05-10" },
          { date: "2026-04-25" },
          { date: "2026-05-01", include: false },
        ],
      }),
    ).toEqual({
      start: "2026-04-25",
      end: "2026-05-10",
      source: "row_dates",
    });
  });
});
