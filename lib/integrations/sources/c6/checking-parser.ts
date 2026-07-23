import {
  amountToFingerprintCents,
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
 * C6 Bank checking CSV (extrato de conta corrente).
 *
 * Real exports start with metadata (title, agency/account, period), then:
 * Data Lançamento, Data Contábil, Título, Descrição, Entrada(R$), Saída(R$), Saldo do Dia(R$)
 *
 * Amounts in the wild sample use US-style decimals (`18.00`, `1380.50`);
 * Brazilian `1.234,56` is also accepted. Credit/debit come from separate columns
 * (not a C/D flag). Balance is informational only — never validated for consistency.
 */
export const C6_CHECKING_HEADER = [
  "Data Lançamento",
  "Data Contábil",
  "Título",
  "Descrição",
  "Entrada(R$)",
  "Saída(R$)",
  "Saldo do Dia(R$)",
] as const;

const C6_PREAMBLE_RE = /EXTRATO DE CONTA CORRENTE\s+C6\s*BANK/i;

function normalizeHeaderCell(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function isC6CheckingHeaderRow(cells: string[]): boolean {
  if (cells.length < C6_CHECKING_HEADER.length) return false;

  return C6_CHECKING_HEADER.every((column, index) => {
    return normalizeHeaderCell(cells[index] ?? "") === column;
  });
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function findC6CheckingHeaderIndex(lines: string[]): number {
  for (let index = 0; index < Math.min(lines.length, 40); index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    const cells = parseCsvContent(line, ",")[0] ?? [];
    if (isC6CheckingHeaderRow(cells)) {
      return index;
    }
  }
  return -1;
}

/** Trusted layout: known table header present (after optional metadata). */
export function matchesC6CheckingHeader(content: string): boolean {
  return findC6CheckingHeaderIndex(splitLines(content)) >= 0;
}

/**
 * Soft signal for clearer unsupported messaging — never unlocks import alone.
 */
export function looksLikeUntrustedC6Checking(content: string): boolean {
  if (matchesC6CheckingHeader(content)) {
    return false;
  }

  const text = content.slice(0, 4000);
  if (C6_PREAMBLE_RE.test(text)) {
    return true;
  }

  const lower = text.toLowerCase();
  return (
    lower.includes("c6 bank") &&
    lower.includes("entrada") &&
    (lower.includes("saída") || lower.includes("saida"))
  );
}

export const C6_UNTRUSTED_IMPORT_MESSAGE =
  "Encontramos indícios de um extrato do C6 Bank, mas o layout não está em um formato que importamos com segurança. Exporte o CSV de conta corrente pelo app/internet banking do C6, com as colunas Data Lançamento, Título, Entrada(R$) e Saída(R$).";

/** Parses a money cell to a non-negative reais amount (0 allowed). */
export function parseC6Money(raw: string): number {
  const cleaned = raw.trim().replace(/^"|"$/g, "").replace(/\s+/g, "");
  if (!cleaned) {
    return 0;
  }

  let numericPart = cleaned
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .replace(/^-/, "")
    .replace(/-$/, "")
    .replace(/^R\$/i, "");

  if (numericPart.includes(",") && numericPart.includes(".")) {
    // BR: 1.234,56
    numericPart = numericPart.replace(/\./g, "").replace(",", ".");
  } else if (numericPart.includes(",")) {
    // BR without thousands: 18,00
    numericPart = numericPart.replace(",", ".");
  }

  const amount = Math.abs(Number.parseFloat(numericPart));
  if (Number.isNaN(amount)) {
    throw new Error(`Valor inválido no extrato C6: ${raw}`);
  }

  return amount;
}

export function resolveC6DirectionAndAmount(input: {
  entradaRaw: string;
  saidaRaw: string;
}): { amount: number; direction: ImportDirection } {
  const entrada = parseC6Money(input.entradaRaw);
  const saida = parseC6Money(input.saidaRaw);

  if (entrada > 0 && saida > 0) {
    throw new Error(
      "Linha C6 com Entrada e Saída preenchidas ao mesmo tempo.",
    );
  }

  if (entrada > 0) {
    return { amount: entrada, direction: "in" };
  }

  if (saida > 0) {
    return { amount: saida, direction: "out" };
  }

  throw new Error("Linha C6 sem valor de Entrada ou Saída.");
}

function classifyC6Description(
  title: string,
  description: string,
  direction: ImportDirection,
): NormalizedImportKind {
  const text = `${title} ${description}`.trim().toLowerCase();

  if (text.includes("estorno")) {
    return "bank_reversal";
  }

  if (
    text.includes("pix enviado") ||
    text.includes("transferência enviada") ||
    text.includes("transferencia enviada") ||
    text.includes("ted enviada")
  ) {
    return "bank_transfer_out";
  }

  if (
    text.includes("pix recebido") ||
    text.includes("transferência recebida") ||
    text.includes("transferencia recebida") ||
    text.includes("ted recebida") ||
    text.includes("res de cdb") ||
    text.includes("resgate")
  ) {
    return "bank_income";
  }

  if (
    text.includes("tarifa") ||
    text.includes("mensalidade") ||
    text.includes("anuidade") ||
    text.includes("estacionamento") ||
    text.includes("compra") ||
    text.includes("emissao") ||
    text.includes("emissão")
  ) {
    return direction === "out" ? "bank_expense" : "bank_income";
  }

  return direction === "in" ? "bank_income" : "bank_expense";
}

function buildC6CheckingFingerprint(input: {
  date: string;
  amount: number;
  direction: ImportDirection;
  title: string;
  description: string;
}): string {
  const amountCents = amountToFingerprintCents(input.amount);
  const title = input.title.trim().toLowerCase();
  const description = input.description.trim().toLowerCase();
  return `c6:checking:${input.date}:${input.direction}:${amountCents}:${title}:${description}`;
}

function buildDisplayDescription(title: string, description: string): string {
  if (title && description && description !== title) {
    return `${title} — ${description}`;
  }
  return title || description;
}

function shouldSkipC6Row(cells: string[]): boolean {
  const joined = cells.map((cell) => cell.trim()).join(" ").toUpperCase();
  if (!joined) return true;

  if (
    joined.startsWith("TOTAL") ||
    joined.includes("SALDO ANTERIOR") ||
    joined.startsWith("OS DADOS") ||
    joined.includes("EXTRATO GERADO")
  ) {
    return true;
  }

  // Footer / noise without a launch date.
  const dateRaw = cells[0]?.trim() ?? "";
  if (!dateRaw || !/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateRaw)) {
    return true;
  }

  return false;
}

export function parseC6CheckingCsv(content: string): ImportParseResult {
  const rows: NormalizedImportRow[] = [];
  const errors: ImportParseResult["errors"] = [];
  const lines = splitLines(content);
  const headerIndex = findC6CheckingHeaderIndex(lines);

  if (headerIndex < 0) {
    return {
      rows,
      errors: [
        {
          sourceLine: 1,
          message: `Header inválido. Esperado: ${C6_CHECKING_HEADER.join(",")}`,
        },
      ],
    };
  }

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const sourceLine = index + 1;
    const rawLine = lines[index]?.trim() ?? "";
    if (!rawLine) continue;

    const cells = parseCsvContent(rawLine, ",")[0] ?? [];
    if (shouldSkipC6Row(cells)) {
      continue;
    }

    const [
      launchDateRaw = "",
      accountingDateRaw = "",
      titleRaw = "",
      descriptionRaw = "",
      entradaRaw = "",
      saidaRaw = "",
      balanceRaw = "",
    ] = cells;

    try {
      const date = normalizeIsoDate(launchDateRaw);
      const accountingDate = accountingDateRaw.trim()
        ? normalizeIsoDate(accountingDateRaw)
        : undefined;
      const title = titleRaw.trim();
      const detail = descriptionRaw.trim();
      const { amount, direction } = resolveC6DirectionAndAmount({
        entradaRaw,
        saidaRaw,
      });
      const description = buildDisplayDescription(title, detail);
      const kind = classifyC6Description(title, detail, direction);
      const balanceAfter =
        balanceRaw.trim().length > 0 ? parseC6Money(balanceRaw) : undefined;

      rows.push({
        source: "c6_checking",
        sourceLine,
        date,
        description,
        amount,
        direction,
        kind,
        externalFingerprint: buildC6CheckingFingerprint({
          date,
          amount,
          direction,
          title,
          description: detail,
        }),
        externalId: null,
        metadata: {
          rawAmount:
            direction === "in" ? entradaRaw.trim() : saidaRaw.trim(),
          accountingDate,
          title: title || undefined,
          balanceAfter,
          rawEntrada: entradaRaw.trim() || undefined,
          rawSaida: saidaRaw.trim() || undefined,
        },
        reviewStatus: "ready",
      });
    } catch (error) {
      errors.push({
        sourceLine,
        message:
          error instanceof Error
            ? error.message
            : "Erro ao parsear linha da conta C6.",
      });
    }
  }

  return { rows, errors };
}
