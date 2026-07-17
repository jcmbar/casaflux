import type {
  RecurrenceEndType,
  RecurrenceFrequency,
} from "@/types/recurrence";

// All dates are handled as ISO "YYYY-MM-DD" strings in UTC to avoid
// timezone drift when computing schedules.

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Returns the date of the occurrence at `index` (0 = start date).
 *
 * Monthly and yearly schedules are always computed from the start date
 * (not from the previous occurrence) so the anchor day never drifts:
 * a recurrence starting on Jan 31 yields Feb 28 (clamped) and Mar 31.
 */
export function getOccurrenceDate(
  startDate: string,
  frequency: RecurrenceFrequency,
  index: number,
): string {
  if (index < 0 || !Number.isInteger(index)) {
    throw new Error(`Invalid occurrence index: ${index}`);
  }

  if (frequency === "weekly") {
    return addDaysIso(startDate, 7 * index);
  }

  if (frequency === "biweekly") {
    return addDaysIso(startDate, 14 * index);
  }

  const start = parseIsoDate(startDate);
  const anchorDay = start.getUTCDate();

  if (frequency === "monthly") {
    const totalMonths = start.getUTCMonth() + index;
    const year = start.getUTCFullYear() + Math.floor(totalMonths / 12);
    const monthIndex = totalMonths % 12;
    const day = Math.min(anchorDay, daysInMonth(year, monthIndex));
    return formatIsoDate(new Date(Date.UTC(year, monthIndex, day)));
  }

  // yearly
  const year = start.getUTCFullYear() + index;
  const monthIndex = start.getUTCMonth();
  const day = Math.min(anchorDay, daysInMonth(year, monthIndex));
  return formatIsoDate(new Date(Date.UTC(year, monthIndex, day)));
}

export type RecurrenceSchedule = {
  startDate: string;
  frequency: RecurrenceFrequency;
  endType: RecurrenceEndType;
  endDate: string | null;
  occurrencesLimit: number | null;
};

/**
 * Enumerates every scheduled date from the start date up to (and
 * including) `until`, respecting the recurrence end rule.
 */
export function enumerateOccurrenceDates(
  schedule: RecurrenceSchedule,
  until: string,
): string[] {
  const dates: string[] = [];
  let index = 0;

  while (true) {
    if (
      schedule.endType === "occurrences_count" &&
      schedule.occurrencesLimit !== null &&
      index >= schedule.occurrencesLimit
    ) {
      break;
    }

    const date = getOccurrenceDate(
      schedule.startDate,
      schedule.frequency,
      index,
    );

    if (compareIsoDates(date, until) > 0) {
      break;
    }

    if (
      schedule.endType === "until_date" &&
      schedule.endDate !== null &&
      compareIsoDates(date, schedule.endDate) > 0
    ) {
      break;
    }

    dates.push(date);
    index += 1;
  }

  return dates;
}
