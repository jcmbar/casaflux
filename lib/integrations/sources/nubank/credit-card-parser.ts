import {
  amountToFingerprintCents,
  normalizeIsoDate,
  parseCsvContent,
  parseNubankCreditCardAmount,
} from "../../core/normalize";
import type {
  ImportParseResult,
  NormalizedImportKind,
  NormalizedImportRow,
} from "../../types";
import {
  extractInstallment,
  isNubankInvoicePayment,
  isNubankIofFee,
} from "./payment-detector";
import { isCreditCardInvoicePaymentCandidate } from "../../invoice-payment/resolve-invoice-payment";

const EXPECTED_HEADER = ["date", "title", "amount"];

export type ParseNubankCreditCardOptions = {
  content: string;
  cardAccountId: string;
};

function classifyCreditCardRow(input: {
  title: string;
  direction: "in" | "out";
}): NormalizedImportKind {
  if (
    isCreditCardInvoicePaymentCandidate({
      description: input.title,
      direction: input.direction,
      source: "nubank_credit_card",
    })
  ) {
    return "card_invoice_payment";
  }

  // Exact title without the credit direction → do not auto-classify as payment.
  if (isNubankInvoicePayment(input.title)) {
    return "card_purchase";
  }

  if (isNubankIofFee(input.title)) {
    return "card_fee";
  }

  if (extractInstallment(input.title)) {
    return "card_purchase";
  }

  return "card_purchase";
}

function buildCreditCardFingerprint(
  cardAccountId: string,
  date: string,
  amount: number,
  title: string,
  installment?: string,
): string {
  const amountCents = amountToFingerprintCents(amount);
  const normalizedTitle = title.trim().toLowerCase();

  if (isNubankInvoicePayment(title)) {
    return `nubank:card:payment:${cardAccountId}:${date}:${amountCents}`;
  }

  const base = `nubank:card:${cardAccountId}:${date}:${amountCents}:${normalizedTitle}`;
  return installment ? `${base}:${installment}` : base;
}

export function parseNubankCreditCardCsv(
  options: ParseNubankCreditCardOptions,
): ImportParseResult {
  const rows: NormalizedImportRow[] = [];
  const errors: ImportParseResult["errors"] = [];
  const parsedRows = parseCsvContent(options.content);

  if (parsedRows.length === 0) {
    return {
      rows,
      errors: [{ sourceLine: 1, message: "CSV vazio." }],
    };
  }

  const [header, ...dataRows] = parsedRows;
  const normalizedHeader = header.map((column) => column.trim().toLowerCase());

  if (
    normalizedHeader.length !== EXPECTED_HEADER.length ||
    !EXPECTED_HEADER.every((column, index) => normalizedHeader[index] === column)
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
    const [dateRaw, titleRaw, amountRaw] = dataRows[index];

    if (!dateRaw?.trim() && !titleRaw?.trim() && !amountRaw?.trim()) {
      continue;
    }

    try {
      const date = normalizeIsoDate(dateRaw ?? "");
      const title = (titleRaw ?? "").trim();
      const { amount, direction } = parseNubankCreditCardAmount(amountRaw ?? "");
      const installment = extractInstallment(title);
      const kind = classifyCreditCardRow({ title, direction });

      rows.push({
        source: "nubank_credit_card",
        sourceLine,
        date,
        description: title,
        amount,
        direction,
        kind,
        externalFingerprint: buildCreditCardFingerprint(
          options.cardAccountId,
          date,
          amount,
          title,
          installment,
        ),
        externalId: null,
        metadata: {
          rawAmount: amountRaw?.trim(),
          installment,
          cardAccountId: options.cardAccountId,
        },
        reviewStatus: kind === "card_invoice_payment" ? "needs_account" : "ready",
      });
    } catch (error) {
      errors.push({
        sourceLine,
        message:
          error instanceof Error ? error.message : "Erro ao parsear linha do cartão.",
      });
    }
  }

  return { rows, errors };
}
