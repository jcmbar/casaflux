import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildImportPreview } from "./import-orchestrator";
import { resolveImportedInvoicePaymentForAccount } from "../invoice-payment/resolve-invoice-payment";
import {
  buildImportReviewContext,
  collectUniqueInvoicePeriodLabels,
  formatImportReviewContextHeadline,
  formatImportReviewPeriodLabel,
  getImportReviewPeriodFromRows,
} from "./import-review-context";
import type { Account } from "@/types/account";

const NUBANK_CHECKING = readFileSync(
  path.join(
    process.cwd(),
    "lib/integrations/__fixtures__/nubank/NU_74988370_01JUL2026_19JUL2026.csv",
  ),
  "utf8",
);

const INTER_CHECKING = readFileSync(
  path.join(
    process.cwd(),
    "lib/integrations/__fixtures__/inter/inter_checking_sample.csv",
  ),
  "utf8",
);

const BRADESCO_CHECKING = readFileSync(
  path.join(
    process.cwd(),
    "lib/integrations/__fixtures__/bradesco/bradesco_checking_sample.csv",
  ),
  "utf8",
);

const NUBANK_CARD = readFileSync(
  path.join(
    process.cwd(),
    "lib/integrations/__fixtures__/nubank/Nubank_2026-08-01.csv",
  ),
  "utf8",
);

describe("formatImportReviewPeriodLabel", () => {
  it("formats compact same-year ranges", () => {
    expect(formatImportReviewPeriodLabel("2026-07-01", "2026-07-31")).toBe(
      "01/07–31/07",
    );
    expect(formatImportReviewPeriodLabel("2026-07-01", "2026-07-01")).toBe(
      "01/07",
    );
  });
});

describe("buildImportReviewContext", () => {
  it("builds account/period summary for Nubank checking", () => {
    const preview = buildImportPreview({ content: NUBANK_CHECKING });
    const period = getImportReviewPeriodFromRows(preview.rows);
    expect(period?.from).toBe("2026-07-01");
    expect(period?.to).toBe("2026-07-19");

    const context = buildImportReviewContext({
      destinationAccountLabel: "Conta Nubank",
      rows: preview.rows,
    });

    expect(context?.headline).toBe(
      `Conta destino: Conta Nubank · Período: ${period!.label}`,
    );
    expect(context?.invoicePeriodLabels).toEqual([]);
  });

  it("builds account/period summary for Inter checking", () => {
    const preview = buildImportPreview({ content: INTER_CHECKING });
    const context = buildImportReviewContext({
      destinationAccountLabel: "Conta Inter",
      rows: preview.rows,
    });

    expect(context?.headline).toBe(
      "Conta destino: Conta Inter · Período: 01/07–06/07",
    );
  });

  it("builds account/period summary for Bradesco checking", () => {
    const preview = buildImportPreview({ content: BRADESCO_CHECKING });
    const context = buildImportReviewContext({
      destinationAccountLabel: "Conta Bradesco",
      rows: preview.rows,
    });

    expect(context?.headline).toBe(
      "Conta destino: Conta Bradesco · Período: 01/07–06/07",
    );
  });

  it("adds invoice period links for credit-card payments when available", () => {
    const preview = buildImportPreview({
      content: NUBANK_CARD,
      cardAccountId: "card-1",
    });

    const cardAccount = {
      type: "credit_card",
      statement_closing_day: 25,
      statement_due_day: 5,
    } as Pick<Account, "type" | "statement_closing_day" | "statement_due_day">;

    const invoiceLabels = collectUniqueInvoicePeriodLabels(
      preview.rows
        .filter((row) => row.kind === "card_invoice_payment")
        .map(
          (row) =>
            resolveImportedInvoicePaymentForAccount({
              paymentDate: row.date,
              cardAccount,
            })?.periodLabel,
        ),
    );

    expect(invoiceLabels.length).toBeGreaterThan(0);

    const context = buildImportReviewContext({
      destinationAccountLabel: "Cartão Nubank",
      rows: preview.rows,
      invoicePeriodLabels: invoiceLabels,
    });

    expect(context?.headline).toContain("Conta destino: Cartão Nubank");
    expect(context?.headline).toContain("Período:");
    expect(context?.headline).toContain(`Fatura: ${invoiceLabels[0]}`);
  });

  it("formats headline without account when only period is known", () => {
    expect(
      formatImportReviewContextHeadline({
        destinationAccountLabel: null,
        periodLabel: "01/07–31/07",
      }),
    ).toBe("Período: 01/07–31/07");
  });
});
