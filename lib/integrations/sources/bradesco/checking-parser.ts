import {
  amountToFingerprintCents,
  parseCsvContent,
} from "../../core/normalize";
import type {
  ImportDirection,
  ImportParseResult,
  NormalizedImportKind,
  NormalizedImportRow,
} from "../../types";

/**
 * Bradesco checking CSV from Internet Banking (conta corrente).
 * Classic layout: semicolon-separated with separate credit/debit columns.
 * Header is distinctive (Docto. + Crédito + Débito) to avoid cross-matches.
 */
export const BRADESCO_CHECKING_HEADER = [
  "Data",
  "Histórico",
  "Docto.",
  "Crédito",
  "Débito",
  "Saldo",
] as const;

const BRADESCO_PREAMBLE_RE = /Extrato de:\s*Ag:/i;

function normalizeHeaderCell(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeHeaderForCompare(value: string): string {
  return normalizeHeaderCell(value).replace(/\.$/, "");
}

function isBradescoCheckingHeaderRow(cells: string[]): boolean {
  if (cells.length < BRADESCO_CHECKING_HEADER.length) return false;

  return BRADESCO_CHECKING_HEADER.every((column, index) => {
    const expected = normalizeHeaderForCompare(column);
    const actual = normalizeHeaderForCompare(cells[index] ?? "");
    return actual === expected;
  });
}

function findBradescoCheckingHeaderIndex(lines: string[]): number {
  for (let index = 0; index < Math.min(lines.length, 20); index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    const cells = parseCsvContent(line, ";")[0] ?? [];
    if (isBradescoCheckingHeaderRow(cells)) {
      return index;
    }
  }
  return -1;
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/** Trusted layout: known header present in the file. */
export function matchesBradescoCheckingHeader(content: string): boolean {
  return findBradescoCheckingHeaderIndex(splitLines(content)) >= 0;
}

/**
 * Soft signal: looks like a Bradesco checking export but is not the trusted layout.
 * Used only to block with a clearer message — never unlocks import.
 */
export function looksLikeUntrustedBradescoChecking(content: string): boolean {
  if (matchesBradescoCheckingHeader(content)) {
    return false;
  }

  const text = content.slice(0, 4000);
  if (BRADESCO_PREAMBLE_RE.test(text)) {
    return true;
  }

  const lower = text.toLowerCase();
  return (
    lower.includes("bradesco") &&
    (lower.includes("crédito") || lower.includes("credito")) &&
    (lower.includes("débito") || lower.includes("debito"))
  );
}

export const BRADESCO_UNTRUSTED_IMPORT_MESSAGE =
  "Encontramos indícios de um extrato do Bradesco, mas o layout não está em um formato que importamos com segurança. Exporte o CSV de conta corrente pelo Internet Banking, com as colunas Data, Histórico, Docto., Crédito e Débito.";

export function normalizeBradescoDate(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) {
    throw new Error(`Data inválida no extrato Bradesco: ${raw}`);
  }

  const day = match[1]!.padStart(2, "0");
  const month = match[2]!.padStart(2, "0");
  let year = Number.parseInt(match[3]!, 10);
  if (match[3]!.length === 2) {
    year += 2000;
  }

  return `${year}-${month}-${day}`;
}

export function parseBradescoCheckingAmount(raw: string): number {
  const cleaned = raw.trim().replace(/^"|"$/g, "").replace(/\s+/g, "");
  if (!cleaned) {
    throw new Error(`Valor inválido no extrato Bradesco: ${raw}`);
  }

  let numericPart = cleaned
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .replace(/^-/, "")
    .replace(/-$/, "")
    .replace(/^R\$/i, "");

  if (numericPart.includes(",") && numericPart.includes(".")) {
    numericPart = numericPart.replace(/\./g, "").replace(",", ".");
  } else if (numericPart.includes(",")) {
    numericPart = numericPart.replace(/\./g, "").replace(",", ".");
  }

  const amount = Math.abs(Number.parseFloat(numericPart));
  if (Number.isNaN(amount) || amount <= 0) {
    throw new Error(`Valor inválido no extrato Bradesco: ${raw}`);
  }

  return amount;
}

function classifyBradescoDescription(
  description: string,
  direction: ImportDirection,
): NormalizedImportKind {
  const text = description.trim().toLowerCase();

  if (text.includes("estorno")) {
    return "bank_reversal";
  }

  if (
    text.includes("pix enviado") ||
    text.includes("transferencia pix enviada") ||
    text.includes("transferência pix enviada") ||
    text.includes("ted enviada") ||
    text.includes("transferencia enviada") ||
    text.includes("transferência enviada")
  ) {
    return "bank_transfer_out";
  }

  if (
    text.includes("pix recebido") ||
    text.includes("ted recebida") ||
    text.includes("transferencia recebida") ||
    text.includes("transferência recebida") ||
    text.includes("deposito") ||
    text.includes("depósito")
  ) {
    return "bank_income";
  }

  if (
    text.includes("compra") ||
    text.includes("pagamento") ||
    text.includes("debito") ||
    text.includes("débito")
  ) {
    return direction === "out" ? "bank_expense" : "bank_income";
  }

  return direction === "in" ? "bank_income" : "bank_expense";
}

function buildBradescoCheckingFingerprint(input: {
  date: string;
  amount: number;
  direction: ImportDirection;
  description: string;
  docto: string;
}): string {
  const amountCents = amountToFingerprintCents(input.amount);
  const description = input.description.trim().toLowerCase();
  const docto = input.docto.trim().toLowerCase();
  return `bradesco:checking:${input.date}:${input.direction}:${amountCents}:${docto}:${description}`;
}

function shouldSkipBradescoDescription(description: string): boolean {
  const normalized = description.trim().toUpperCase();
  return (
    normalized === "" ||
    normalized === "SALDO ANTERIOR" ||
    normalized.startsWith("SALDO DO DIA") ||
    normalized.startsWith(";TOTAL") ||
    normalized.startsWith("OS DADOS")
  );
}

export function parseBradescoCheckingCsv(content: string): ImportParseResult {
  const rows: NormalizedImportRow[] = [];
  const errors: ImportParseResult["errors"] = [];
  const lines = splitLines(content);
  const headerIndex = findBradescoCheckingHeaderIndex(lines);

  if (headerIndex < 0) {
    return {
      rows,
      errors: [
        {
          sourceLine: 1,
          message: `Header inválido. Esperado: ${BRADESCO_CHECKING_HEADER.join(";")}`,
        },
      ],
    };
  }

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const sourceLine = index + 1;
    const rawLine = lines[index]?.trim() ?? "";
    if (!rawLine) continue;

    // Continuation / totals / section noise — never import.
    if (
      rawLine.startsWith(";") ||
      rawLine.toLowerCase().startsWith("total") ||
      /^últimos lançamentos$/i.test(rawLine) ||
      /^saldos invest/i.test(rawLine)
    ) {
      continue;
    }

    const cells = parseCsvContent(rawLine, ";")[0] ?? [];
    const [dateRaw, historicoRaw, doctoRaw, creditRaw, debitRaw] = cells;

    if (!dateRaw?.trim()) {
      continue;
    }

    const description = (historicoRaw ?? "").trim();
    if (shouldSkipBradescoDescription(description)) {
      continue;
    }

    try {
      const date = normalizeBradescoDate(dateRaw);
      const credit = (creditRaw ?? "").trim();
      const debit = (debitRaw ?? "").trim();

      if (!credit && !debit) {
        errors.push({
          sourceLine,
          message:
            "Linha sem valor de crédito ou débito — não importamos sem valor confiável.",
        });
        continue;
      }

      if (credit && debit) {
        errors.push({
          sourceLine,
          message:
            "Linha com crédito e débito preenchidos — não importamos sem direção confiável.",
        });
        continue;
      }

      const direction: ImportDirection = credit ? "in" : "out";
      const amount = parseBradescoCheckingAmount(credit || debit);
      const kind = classifyBradescoDescription(description, direction);
      const docto = (doctoRaw ?? "").trim().replace(/^"|"$/g, "");

      rows.push({
        source: "bradesco_checking",
        sourceLine,
        date,
        description,
        amount,
        direction,
        kind,
        externalFingerprint: buildBradescoCheckingFingerprint({
          date,
          amount,
          direction,
          description,
          docto,
        }),
        externalId: docto || null,
        metadata: {
          rawAmount: credit || debit,
        },
        reviewStatus: "ready",
      });
    } catch (error) {
      errors.push({
        sourceLine,
        message:
          error instanceof Error
            ? error.message
            : "Erro ao ler linha do extrato Bradesco.",
      });
    }
  }

  return { rows, errors };
}
