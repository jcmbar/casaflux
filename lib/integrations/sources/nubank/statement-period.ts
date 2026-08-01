/**
 * Statement period for a Nubank credit-card CSV.
 * Source of truth: explicit "Período …" text when present, else min/max of date column.
 * Never derived from card closing/due day settings.
 */

export type NubankStatementPeriod = {
  start: string;
  end: string;
  /** How the bounds were obtained. */
  source: "explicit_text" | "row_dates";
};

const PERIOD_TEXT_PATTERN =
  /per[ií]odo\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:a|até|-|–|—)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toIsoYear(raw: string | undefined, fallbackYear: number): number {
  if (!raw) return fallbackYear;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallbackYear;
  if (raw.length <= 2) {
    return n >= 70 ? 1900 + n : 2000 + n;
  }
  return n;
}

/**
 * Parse strings like "Período 20/04 a 18/05" or "Periodo 20/04/2026 até 18/05/2026".
 * Years may be omitted; when omitted, `fallbackYear` (and +1 across year boundary) is used.
 */
export function parseNubankStatementPeriodFromText(
  text: string,
  fallbackYear = new Date().getUTCFullYear(),
): NubankStatementPeriod | null {
  const match = text.match(PERIOD_TEXT_PATTERN);
  if (!match) return null;

  const startDay = Number(match[1]);
  const startMonth = Number(match[2]);
  const endDay = Number(match[4]);
  const endMonth = Number(match[5]);
  if (
    ![startDay, startMonth, endDay, endMonth].every(
      (n) => Number.isInteger(n) && n >= 1,
    ) ||
    startMonth > 12 ||
    endMonth > 12 ||
    startDay > 31 ||
    endDay > 31
  ) {
    return null;
  }

  const startYear = toIsoYear(match[3], fallbackYear);
  let endYear = toIsoYear(match[6], fallbackYear);
  // If years omitted and end month/day is before start, assume year wrap.
  if (!match[3] && !match[6]) {
    const startKey = startMonth * 100 + startDay;
    const endKey = endMonth * 100 + endDay;
    if (endKey < startKey) {
      endYear = startYear + 1;
    } else {
      endYear = startYear;
    }
  }

  const start = `${startYear}-${pad2(startMonth)}-${pad2(startDay)}`;
  const end = `${endYear}-${pad2(endMonth)}-${pad2(endDay)}`;
  if (start > end) return null;

  return { start, end, source: "explicit_text" };
}

export function getStatementDateRangeFromRowDates(
  rows: readonly { date?: string | null; include?: boolean }[],
): { start: string; end: string } | null {
  let min: string | null = null;
  let max: string | null = null;
  for (const row of rows) {
    if (row.include === false) continue;
    const date = row.date?.slice(0, 10) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (min == null || date < min) min = date;
    if (max == null || date > max) max = date;
  }
  if (!min || !max) return null;
  return { start: min, end: max };
}

/**
 * Resolve the official statement period for a Nubank CC import.
 * Prefers explicit period text (CSV body / filename / notes); else min/max dates.
 */
export function resolveNubankStatementPeriod(input: {
  rows: readonly { date?: string | null; include?: boolean }[];
  /** Raw CSV text or any sidecar text that may contain "Período …". */
  textSources?: readonly (string | null | undefined)[];
  fallbackYear?: number;
}): NubankStatementPeriod | null {
  const year =
    input.fallbackYear ??
    (() => {
      const range = getStatementDateRangeFromRowDates(input.rows);
      if (range) return Number(range.end.slice(0, 4));
      return new Date().getUTCFullYear();
    })();

  for (const text of input.textSources ?? []) {
    if (!text) continue;
    const parsed = parseNubankStatementPeriodFromText(text, year);
    if (parsed) return parsed;
  }

  const range = getStatementDateRangeFromRowDates(input.rows);
  if (!range) return null;
  return { ...range, source: "row_dates" };
}
