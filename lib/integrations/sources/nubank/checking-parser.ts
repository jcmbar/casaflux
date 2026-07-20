import {
  linkCheckingReversalPairs,
  normalizeIsoDate,
  parseCsvContent,
  parseNubankCheckingAmount,
} from "../../core/normalize";
import type {
  ImportParseResult,
  NormalizedImportKind,
  NormalizedImportRow,
} from "../../types";

const EXPECTED_HEADER = ["Data", "Valor", "Identificador", "Descrição"];

function classifyCheckingDescription(description: string): NormalizedImportKind {
  const normalized = description.trim();

  if (normalized.startsWith("Estorno -")) {
    return "bank_reversal";
  }

  if (normalized.startsWith("Compra no débito")) {
    return "bank_expense";
  }

  if (normalized.startsWith("Transferência enviada")) {
    return "bank_transfer_out";
  }

  if (
    normalized.startsWith("Transferência Recebida") ||
    normalized.startsWith("Transferência recebida pelo Pix")
  ) {
    return "bank_income";
  }

  return "unknown";
}

function buildCheckingFingerprint(identifier: string): string {
  return `nubank:checking:${identifier}`;
}

export function parseNubankCheckingCsv(content: string): ImportParseResult {
  const rows: NormalizedImportRow[] = [];
  const errors: ImportParseResult["errors"] = [];
  const parsedRows = parseCsvContent(content);

  if (parsedRows.length === 0) {
    return {
      rows,
      errors: [{ sourceLine: 1, message: "CSV vazio." }],
    };
  }

  const [header, ...dataRows] = parsedRows;

  if (
    header.length !== EXPECTED_HEADER.length ||
    !EXPECTED_HEADER.every((column, index) => header[index] === column)
  ) {
    return {
      rows,
      errors: [
        {
          sourceLine: 1,
          message: `Header inválido. Esperado: ${EXPECTED_HEADER.join(",")}`,
        },
      ],
    };
  }

  for (let index = 0; index < dataRows.length; index += 1) {
    const sourceLine = index + 2;
    const [dateRaw, amountRaw, identifierRaw, descriptionRaw] = dataRows[index];

    if (
      !dateRaw?.trim() &&
      !amountRaw?.trim() &&
      !identifierRaw?.trim() &&
      !descriptionRaw?.trim()
    ) {
      continue;
    }

    try {
      const date = normalizeIsoDate(dateRaw ?? "");
      const description = (descriptionRaw ?? "").trim();
      const identifier = (identifierRaw ?? "").trim();
      const { amount, direction } = parseNubankCheckingAmount(amountRaw ?? "");
      const kind = classifyCheckingDescription(description);

      rows.push({
        source: "nubank_checking",
        sourceLine,
        date,
        description,
        amount,
        direction,
        kind,
        externalFingerprint: buildCheckingFingerprint(identifier),
        externalId: identifier || null,
        metadata: {
          rawAmount: amountRaw?.trim(),
          nubankIdentifier: identifier || undefined,
        },
        reviewStatus: "ready",
      });
    } catch (error) {
      errors.push({
        sourceLine,
        message:
          error instanceof Error ? error.message : "Erro ao parsear linha da conta.",
      });
    }
  }

  return {
    rows: linkCheckingReversalPairs(rows),
    errors,
  };
}
