import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseBrazilianDateToIso,
  parseNubankCreditCardAmount,
} from "../../core/normalize";
import { hasInstallment, isNubankInvoicePayment } from "./payment-detector";
import { parseNubankCheckingCsv } from "./checking-parser";
import { parseNubankCreditCardCsv } from "./credit-card-parser";

const FIXTURES_DIR = path.join(
  process.cwd(),
  "lib/integrations/__fixtures__/nubank",
);

const CARD_FIXTURE = readFileSync(
  path.join(FIXTURES_DIR, "Nubank_2026-08-01.csv"),
  "utf8",
);

const CHECKING_FIXTURE = readFileSync(
  path.join(FIXTURES_DIR, "NU_74988370_01JUL2026_19JUL2026.csv"),
  "utf8",
);

const CARD_ACCOUNT_ID = "fixture-card-account";

describe("parseNubankCreditCardCsv", () => {
  const result = parseNubankCreditCardCsv({
    content: CARD_FIXTURE,
    cardAccountId: CARD_ACCOUNT_ID,
  });

  it("parses 59 data rows from the real credit card fixture", () => {
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(59);
  });

  it("detects exactly one invoice payment", () => {
    const payments = result.rows.filter((row) => row.kind === "card_invoice_payment");
    expect(payments).toHaveLength(1);
    expect(payments[0]?.description).toBe("Pagamento recebido");
    expect(payments[0]?.reviewStatus).toBe("needs_account");
  });

  it('parses "- 3.598,45" as 3598.45 with direction in', () => {
    const parsed = parseNubankCreditCardAmount('"- 3.598,45"');
    expect(parsed.amount).toBe(3598.45);
    expect(parsed.direction).toBe("in");

    const paymentRow = result.rows.find((row) =>
      isNubankInvoicePayment(row.description),
    );
    expect(paymentRow?.amount).toBe(3598.45);
    expect(paymentRow?.direction).toBe("in");
    expect(paymentRow?.date).toBe("2026-06-26");
  });

  it("detects installment purchases", () => {
    const installmentRows = result.rows.filter((row) => hasInstallment(row.description));
    expect(installmentRows).toHaveLength(11);
    expect(
      installmentRows.every(
        (row) => row.kind === "card_purchase" && row.metadata.installment,
      ),
    ).toBe(true);
  });

  it("detects four IOF fee rows", () => {
    const iofRows = result.rows.filter((row) => row.kind === "card_fee");
    expect(iofRows).toHaveLength(4);
  });

  it("builds composite fingerprints including installment when present", () => {
    const installmentRow = result.rows.find((row) => row.metadata.installment === "1/2");
    expect(installmentRow?.externalFingerprint).toContain(":1/2");
    expect(installmentRow?.externalId).toBeNull();
  });

  it("keeps card purchase dates in ISO format", () => {
    expect(result.rows.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date))).toBe(
      true,
    );
    expect(result.rows[0]?.date).toBe("2026-07-20");
  });
});

describe("parseNubankCheckingCsv", () => {
  const result = parseNubankCheckingCsv(CHECKING_FIXTURE);

  it("parses 24 data rows from the real checking fixture", () => {
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(24);
  });

  it("normalizes Brazilian dates to ISO", () => {
    expect(parseBrazilianDateToIso("01/07/2026")).toBe("2026-07-01");
    expect(result.rows[0]?.date).toBe("2026-07-01");
    expect(result.rows.at(-1)?.date).toBe("2026-07-19");
  });

  it("uses Identificador as primary fingerprint and externalId", () => {
    const firstRow = result.rows[0];
    expect(firstRow?.externalId).toBe("6a45ab80-9527-4788-b58f-efa6fc025c8b");
    expect(firstRow?.externalFingerprint).toBe(
      "nubank:checking:6a45ab80-9527-4788-b58f-efa6fc025c8b",
    );
  });

  it("identifies the repeated UUID in the reversal pair and links both rows", () => {
    const reversalUuid = "6a5cff73-490e-4f8e-8e67-953f71d273d1";
    const pairRows = result.rows.filter((row) => row.externalId === reversalUuid);

    expect(pairRows).toHaveLength(2);
    expect(pairRows.map((row) => row.kind)).toEqual([
      "bank_transfer_out",
      "bank_reversal",
    ]);
    expect(pairRows.every((row) => row.metadata.reversalPair)).toBe(true);
    expect(pairRows.every((row) => row.metadata.linkedExternalId === reversalUuid)).toBe(
      true,
    );
  });

  it("classifies common checking descriptions", () => {
    expect(result.rows.filter((row) => row.kind === "bank_income").length).toBeGreaterThan(
      0,
    );
    expect(result.rows.filter((row) => row.kind === "bank_expense")).toHaveLength(2);
    expect(
      result.rows.filter((row) => row.kind === "bank_transfer_out").length,
    ).toBeGreaterThan(0);
  });
});
