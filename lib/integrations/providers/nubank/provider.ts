import { parseCsvContent } from "../../core/normalize";
import { parseNubankCheckingCsv } from "../../sources/nubank/checking-parser";
import { parseNubankCreditCardCsv } from "../../sources/nubank/credit-card-parser";
import type {
  ImportIntegrationProvider,
  ImportSourceProvider,
} from "../types";

const CREDIT_CARD_HEADER = ["date", "title", "amount"];
const CHECKING_HEADER = ["Data", "Valor", "Identificador", "Descrição"];

function readCsvHeader(content: string): string[] | null {
  const parsedRows = parseCsvContent(content);
  if (parsedRows.length === 0) return null;
  return parsedRows[0].map((column) => column.trim());
}

function matchesCreditCardHeader(content: string): boolean {
  const header = readCsvHeader(content);
  if (!header) return false;
  const normalizedHeader = header.map((column) => column.toLowerCase());
  return (
    normalizedHeader.length === CREDIT_CARD_HEADER.length &&
    CREDIT_CARD_HEADER.every(
      (column, index) => normalizedHeader[index] === column,
    )
  );
}

function matchesCheckingHeader(content: string): boolean {
  const header = readCsvHeader(content);
  if (!header) return false;
  return (
    header.length === CHECKING_HEADER.length &&
    CHECKING_HEADER.every((column, index) => header[index] === column)
  );
}

export const nubankCreditCardImportProvider: ImportSourceProvider = {
  source: "nubank_credit_card",
  providerId: "nubank",
  requiresCardAccount: true,
  matches: matchesCreditCardHeader,
  parse: (input) => {
    if (!input.cardAccountId) {
      return {
        rows: [],
        errors: [
          {
            sourceLine: 1,
            message: "cardAccountId ausente para importação de cartão.",
          },
        ],
      };
    }

    return parseNubankCreditCardCsv({
      content: input.content,
      cardAccountId: input.cardAccountId,
    });
  },
};

export const nubankCheckingImportProvider: ImportSourceProvider = {
  source: "nubank_checking",
  providerId: "nubank",
  requiresCardAccount: false,
  matches: matchesCheckingHeader,
  parse: (input) => parseNubankCheckingCsv(input.content),
};

/** Nubank integration: checking + credit-card CSV layouts. */
export const nubankImportIntegration: ImportIntegrationProvider = {
  id: "nubank",
  layouts: [nubankCreditCardImportProvider, nubankCheckingImportProvider],
};
