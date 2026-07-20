import { parseCsvContent } from "./normalize";
import type { ImportSource } from "../types";

const CREDIT_CARD_HEADER = ["date", "title", "amount"];
const CHECKING_HEADER = ["Data", "Valor", "Identificador", "Descrição"];

export function detectImportSource(content: string): ImportSource | null {
  const parsedRows = parseCsvContent(content);

  if (parsedRows.length === 0) {
    return null;
  }

  const header = parsedRows[0].map((column) => column.trim());
  const normalizedHeader = header.map((column) => column.toLowerCase());

  if (
    normalizedHeader.length === CREDIT_CARD_HEADER.length &&
    CREDIT_CARD_HEADER.every((column, index) => normalizedHeader[index] === column)
  ) {
    return "nubank_credit_card";
  }

  if (
    header.length === CHECKING_HEADER.length &&
    CHECKING_HEADER.every((column, index) => header[index] === column)
  ) {
    return "nubank_checking";
  }

  return null;
}
