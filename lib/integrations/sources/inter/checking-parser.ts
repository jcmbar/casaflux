import {
  amountToFingerprintCents,
  detectCsvDelimiter,
  normalizeIsoDate,
  parseCsvContent,
} from "../../core/normalize";
import type {
  ImportDirection,
  ImportParseResult,
  NormalizedImportKind,
  NormalizedImportRow,
} from "../../types";

/**
 * Inter checking CSV layout (export from Conta Digital).
 * Supports comma or semicolon delimiters.
 * Header is distinctive from Nubank to avoid cross-matches.
 */
export const INTER_CHECKING_HEADER = [
  "Data Lançamento",
  "Histórico",
  "Descrição",
  "Valor",
  "Saldo",
] as const;

function normalizeHeaderCell(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function matchesInterCheckingHeader(content: string): boolean {
  const delimiter = detectCsvDelimiter(content);
  const rows = parseCsvContent(content, delimiter);
  if (rows.length === 0) return false;

  const header = rows[0].map(normalizeHeaderCell);
  if (header.length !== INTER_CHECKING_HEADER.length) return false;

  return INTER_CHECKING_HEADER.every(
    (column, index) => header[index] === column,
  );
}

export function parseInterCheckingAmount(raw: string): {
  amount: number;
  direction: ImportDirection;
} {
  const cleaned = raw.trim().replace(/^"|"$/g, "").replace(/\s+/g, "");
  if (!cleaned) {
    throw new Error(`Invalid Inter amount: ${raw}`);
  }

  const isNegative =
    cleaned.startsWith("-") ||
    cleaned.endsWith("-") ||
    cleaned.includes("(");

  let numericPart = cleaned
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .replace(/^-/, "")
    .replace(/-$/, "");

  // BR: 1.234,56 — US/Inter mixed: 1234.56 or 50,00
  if (numericPart.includes(",") && numericPart.includes(".")) {
    numericPart = numericPart.replace(/\./g, "").replace(",", ".");
  } else if (numericPart.includes(",")) {
    numericPart = numericPart.replace(",", ".");
  }

  const amount = Math.abs(Number.parseFloat(numericPart));
  if (Number.isNaN(amount)) {
    throw new Error(`Invalid Inter amount: ${raw}`);
  }

  return {
    amount,
    direction: isNegative ? "out" : "in",
  };
}

function classifyInterDescription(
  historico: string,
  description: string,
  direction: ImportDirection,
): NormalizedImportKind {
  const text = `${historico} ${description}`.trim().toLowerCase();

  if (text.includes("estorno")) {
    return "bank_reversal";
  }

  if (
    text.includes("pix enviado") ||
    text.includes("transferência enviada") ||
    text.includes("transferencia enviada") ||
    text.includes("ted enviada") ||
    text.includes("pagamento enviado")
  ) {
    return "bank_transfer_out";
  }

  if (
    text.includes("pix recebido") ||
    text.includes("transferência recebida") ||
    text.includes("transferencia recebida") ||
    text.includes("ted recebida")
  ) {
    return "bank_income";
  }

  if (
    text.includes("compra") ||
    text.includes("débito") ||
    text.includes("debito") ||
    text.includes("pagamento")
  ) {
    return direction === "out" ? "bank_expense" : "bank_income";
  }

  // Safe fallback for checking: direction implies income/expense (committable).
  return direction === "in" ? "bank_income" : "bank_expense";
}

function buildInterCheckingFingerprint(input: {
  date: string;
  amount: number;
  direction: ImportDirection;
  historico: string;
  description: string;
}): string {
  const amountCents = amountToFingerprintCents(input.amount);
  const historico = input.historico.trim().toLowerCase();
  const description = input.description.trim().toLowerCase();
  return `inter:checking:${input.date}:${input.direction}:${amountCents}:${historico}:${description}`;
}

export function parseInterCheckingCsv(content: string): ImportParseResult {
  const rows: NormalizedImportRow[] = [];
  const errors: ImportParseResult["errors"] = [];
  const delimiter = detectCsvDelimiter(content);
  const parsedRows = parseCsvContent(content, delimiter);

  if (parsedRows.length === 0) {
    return {
      rows,
      errors: [{ sourceLine: 1, message: "CSV vazio." }],
    };
  }

  const [header, ...dataRows] = parsedRows;
  const normalizedHeader = header.map(normalizeHeaderCell);

  if (
    normalizedHeader.length !== INTER_CHECKING_HEADER.length ||
    !INTER_CHECKING_HEADER.every(
      (column, index) => normalizedHeader[index] === column,
    )
  ) {
    return {
      rows,
      errors: [
        {
          sourceLine: 1,
          message: `Header inválido. Esperado: ${INTER_CHECKING_HEADER.join(",")}`,
        },
      ],
    };
  }

  for (let index = 0; index < dataRows.length; index += 1) {
    const sourceLine = index + 2;
    const [dateRaw, historicoRaw, descriptionRaw, amountRaw] =
      dataRows[index] ?? [];

    if (
      !dateRaw?.trim() &&
      !historicoRaw?.trim() &&
      !descriptionRaw?.trim() &&
      !amountRaw?.trim()
    ) {
      continue;
    }

    try {
      const date = normalizeIsoDate(dateRaw ?? "");
      const historico = (historicoRaw ?? "").trim();
      const description = (descriptionRaw ?? "").trim() || historico;
      const { amount, direction } = parseInterCheckingAmount(amountRaw ?? "");
      const kind = classifyInterDescription(historico, description, direction);
      const displayDescription = historico
        ? `${historico}${description && description !== historico ? ` — ${description}` : ""}`
        : description;

      rows.push({
        source: "inter_checking",
        sourceLine,
        date,
        description: displayDescription,
        amount,
        direction,
        kind,
        externalFingerprint: buildInterCheckingFingerprint({
          date,
          amount,
          direction,
          historico,
          description,
        }),
        externalId: null,
        metadata: {
          rawAmount: amountRaw?.trim(),
        },
        reviewStatus: "ready",
      });
    } catch (error) {
      errors.push({
        sourceLine,
        message:
          error instanceof Error
            ? error.message
            : "Erro ao parsear linha da conta Inter.",
      });
    }
  }

  return { rows, errors };
}
