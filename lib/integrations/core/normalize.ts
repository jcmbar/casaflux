import type { ImportDirection, NormalizedImportRow } from "../types";

export function parseCsvContent(
  content: string,
  delimiter: "," | ";" = ",",
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (inQuotes) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (character === "\n" || character === "\r") {
      if (character === "\r" && content[index + 1] === "\n") {
        index += 1;
      }

      row.push(field);
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

/** Picks comma vs semicolon from the first non-empty line. */
export function detectCsvDelimiter(content: string): "," | ";" {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) return ",";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

export function parseBrazilianDateToIso(date: string): string {
  const [day, month, year] = date.trim().split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Normalizes CSV date cells to `YYYY-MM-DD`.
 * Accepts ISO dates, ISO datetimes (uses the calendar date prefix), and
 * Brazilian `DD/MM/YYYY` (optionally with a time suffix).
 * Does not apply timezone conversion or ±1 day adjustments.
 */
export function normalizeIsoDate(date: string): string {
  const trimmed = date.trim();

  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) {
    return isoPrefix[1]!;
  }

  const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const [, day, month, year] = br;
    return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }

  return parseBrazilianDateToIso(trimmed);
}

export function parseNubankCreditCardAmount(raw: string): {
  amount: number;
  direction: ImportDirection;
} {
  const cleaned = raw.trim().replace(/^"|"$/g, "").replace(/\s+/g, "");
  const isNegative = cleaned.startsWith("-");
  const numericPart = cleaned.replace(/^-/, "").replace(/\./g, "").replace(",", ".");
  const amount = Math.abs(Number.parseFloat(numericPart));

  if (Number.isNaN(amount)) {
    throw new Error(`Invalid credit card amount: ${raw}`);
  }

  return {
    amount,
    direction: isNegative ? "in" : "out",
  };
}

export function parseNubankCheckingAmount(raw: string): {
  amount: number;
  direction: ImportDirection;
} {
  const value = Number.parseFloat(raw.trim());

  if (Number.isNaN(value)) {
    throw new Error(`Invalid checking amount: ${raw}`);
  }

  return {
    amount: Math.abs(value),
    direction: value >= 0 ? "in" : "out",
  };
}

export function amountToFingerprintCents(amount: number): number {
  return Math.round(amount * 100);
}

export function linkCheckingReversalPairs(
  rows: NormalizedImportRow[],
): NormalizedImportRow[] {
  const rowsByExternalId = new Map<string, NormalizedImportRow[]>();

  for (const row of rows) {
    if (!row.externalId) {
      continue;
    }

    const group = rowsByExternalId.get(row.externalId) ?? [];
    group.push(row);
    rowsByExternalId.set(row.externalId, group);
  }

  return rows.map((row) => {
    if (!row.externalId) {
      return row;
    }

    const group = rowsByExternalId.get(row.externalId);
    if (!group || group.length < 2) {
      return row;
    }

    return {
      ...row,
      metadata: {
        ...row.metadata,
        reversalPair: true,
        linkedExternalId: row.externalId ?? undefined,
      },
    };
  });
}
