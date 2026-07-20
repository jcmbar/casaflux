import { formatShortBrDate } from "@/lib/finance/credit-card-billing";

import type { ImportPreviewRow } from "../types";

export type ImportReviewContextRow = Pick<ImportPreviewRow, "date" | "kind">;

export type ImportReviewContext = {
  /** Short scannable line for the top of review. */
  headline: string;
  destinationAccountLabel: string | null;
  periodLabel: string | null;
  /** Statement periods linked from invoice-payment rows (cards). */
  invoicePeriodLabels: string[];
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Compact BR period from ISO dates already normalized on preview rows.
 * Same day → "01/07"; same year → "01/07–19/07"; otherwise includes years.
 */
export function formatImportReviewPeriodLabel(
  fromIso: string,
  toIso: string,
): string {
  if (!isIsoDate(fromIso) || !isIsoDate(toIso)) {
    return fromIso === toIso ? fromIso : `${fromIso}–${toIso}`;
  }

  if (fromIso === toIso) {
    return formatShortBrDate(fromIso);
  }

  const fromYear = fromIso.slice(0, 4);
  const toYear = toIso.slice(0, 4);

  if (fromYear === toYear) {
    return `${formatShortBrDate(fromIso)}–${formatShortBrDate(toIso)}`;
  }

  const [fy, fm, fd] = fromIso.split("-");
  const [ty, tm, td] = toIso.split("-");
  return `${fd}/${fm}/${fy}–${td}/${tm}/${ty}`;
}

export function getImportReviewPeriodFromRows(
  rows: Array<Pick<ImportReviewContextRow, "date">>,
): { from: string; to: string; label: string } | null {
  const dates = rows
    .map((row) => row.date)
    .filter((date): date is string => Boolean(date) && isIsoDate(date))
    .sort();

  if (dates.length === 0) {
    return null;
  }

  const from = dates[0]!;
  const to = dates[dates.length - 1]!;
  return {
    from,
    to,
    label: formatImportReviewPeriodLabel(from, to),
  };
}

export function collectUniqueInvoicePeriodLabels(
  labels: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const label of labels) {
    const trimmed = label?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

export function formatImportReviewContextHeadline(input: {
  destinationAccountLabel: string | null;
  periodLabel: string | null;
  invoicePeriodLabels?: string[];
}): string {
  const parts: string[] = [];

  if (input.destinationAccountLabel?.trim()) {
    parts.push(`Conta destino: ${input.destinationAccountLabel.trim()}`);
  }

  if (input.periodLabel?.trim()) {
    parts.push(`Período: ${input.periodLabel.trim()}`);
  }

  const invoices = input.invoicePeriodLabels ?? [];
  if (invoices.length === 1) {
    parts.push(`Fatura: ${invoices[0]}`);
  } else if (invoices.length > 1) {
    parts.push(`Faturas: ${invoices.join(", ")}`);
  }

  return parts.join(" · ");
}

/**
 * Presentation context for the import review step.
 * Uses normalized preview dates + optional invoice period labels — no commit changes.
 */
export function buildImportReviewContext(input: {
  destinationAccountLabel: string | null;
  rows: ImportReviewContextRow[];
  invoicePeriodLabels?: string[];
}): ImportReviewContext | null {
  const period = getImportReviewPeriodFromRows(input.rows);
  const invoicePeriodLabels = collectUniqueInvoicePeriodLabels(
    input.invoicePeriodLabels ?? [],
  );
  const destinationAccountLabel =
    input.destinationAccountLabel?.trim() || null;

  if (!destinationAccountLabel && !period && invoicePeriodLabels.length === 0) {
    return null;
  }

  const periodLabel = period?.label ?? null;
  const headline = formatImportReviewContextHeadline({
    destinationAccountLabel,
    periodLabel,
    invoicePeriodLabels,
  });

  if (!headline) {
    return null;
  }

  return {
    headline,
    destinationAccountLabel,
    periodLabel,
    invoicePeriodLabels,
  };
}
