import { describe, expect, it } from "vitest";

import { buildImportedCardStatementCycleUpserts } from "./capture-imported-statement-cycle";
import type { ImportPreviewRow } from "../types";

const CONFIG = {
  statementClosingDay: 25,
  statementDueDay: 1,
};

function paymentRow(
  partial: Partial<ImportPreviewRow> &
    Pick<ImportPreviewRow, "sourceLine" | "date" | "amount">,
): ImportPreviewRow {
  return {
    source: "nubank_credit_card",
    description: "Pagamento recebido",
    direction: "in",
    kind: "card_invoice_payment",
    externalFingerprint: `fp-${partial.sourceLine}`,
    externalId: null,
    metadata: {},
    reviewStatus: "ready",
    historicalStatus: "new",
    categoryStatus: "none",
    ...partial,
  };
}

describe("buildImportedCardStatementCycleUpserts", () => {
  it("captures cycle metadata from confirmed invoice payments", () => {
    const upserts = buildImportedCardStatementCycleUpserts({
      rows: [
        paymentRow({
          sourceLine: 1,
          date: "2026-08-01",
          amount: 1500,
        }),
      ],
      billingConfig: CONFIG,
      accountId: "card-1",
      ownerUserId: "user-1",
      fileName: "Nubank_2026-08-01.csv",
      fileCycle: {
        closingDate: "2026-07-25",
        dueDate: "2026-08-01",
      },
      importBatchId: "batch-1",
      invoicePaymentModes: { 1: "payment" },
      invoicePaymentCycleTargets: { 1: { target: "previous" } },
    });

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      accountId: "card-1",
      closingDate: "2026-07-25",
      dueDate: "2026-08-01",
      amountDue: null,
      source: "imported",
      importBatchId: "batch-1",
    });
  });

  it("stores the CSV purchase total as amount_due on the file statement", () => {
    const purchase = (partial: {
      sourceLine: number;
      date: string;
      amount: number;
    }): ImportPreviewRow => ({
      source: "nubank_credit_card",
      description: `Compra ${partial.sourceLine}`,
      direction: "out",
      kind: "card_purchase",
      externalFingerprint: `fp-${partial.sourceLine}`,
      externalId: null,
      metadata: {},
      reviewStatus: "ready",
      historicalStatus: "new",
      categoryStatus: "none",
      ...partial,
    });

    const upserts = buildImportedCardStatementCycleUpserts({
      rows: [
        purchase({ sourceLine: 1, date: "2026-05-10", amount: 3790.98 }),
        purchase({ sourceLine: 2, date: "2026-04-25", amount: 863.48 }),
        paymentRow({
          sourceLine: 3,
          date: "2026-05-24",
          amount: 100,
        }),
      ],
      billingConfig: {
        statementClosingDay: 25,
        statementDueDay: 1,
      },
      accountId: "card-1",
      ownerUserId: "user-1",
      fileCycle: {
        closingDate: "2026-05-25",
        dueDate: "2026-06-01",
      },
      invoicePaymentModes: { 3: "payment" },
      invoicePaymentCycleTargets: {
        3: { target: "previous", targetDueDate: "2026-05-04" },
      },
    });

    const fileBill = upserts.find((row) => row.closingDate === "2026-05-25");
    expect(fileBill).toMatchObject({
      dueDate: "2026-06-01",
      amountDue: 4654.46,
    });

    // Payment-targeted previous bill must not inherit the file purchase total.
    const previous = upserts.find((row) => row.dueDate === "2026-05-04");
    if (previous) {
      expect(previous.amountDue).toBeNull();
    }
  });

  it("nets estorno/credits into the file amount_due", () => {
    const purchase = (partial: {
      sourceLine: number;
      date: string;
      amount: number;
      direction?: "in" | "out";
      description?: string;
    }): ImportPreviewRow => ({
      source: "nubank_credit_card",
      description: partial.description ?? `Compra ${partial.sourceLine}`,
      direction: partial.direction ?? "out",
      kind: "card_purchase",
      externalFingerprint: `fp-${partial.sourceLine}`,
      externalId: null,
      metadata: {},
      reviewStatus: "ready",
      historicalStatus: "new",
      categoryStatus: "none",
      ...partial,
    });

    const upserts = buildImportedCardStatementCycleUpserts({
      rows: [
        purchase({ sourceLine: 1, date: "2026-06-10", amount: 3648.39 }),
        purchase({
          sourceLine: 2,
          date: "2026-06-22",
          amount: 49.97,
          direction: "in",
          description: 'Estorno de "Ifd*Ocaneco"',
        }),
        paymentRow({
          sourceLine: 3,
          date: "2026-05-25",
          amount: 4654.46,
        }),
      ],
      billingConfig: {
        statementClosingDay: 25,
        statementDueDay: 1,
      },
      accountId: "card-1",
      ownerUserId: "user-1",
      fileCycle: {
        closingDate: "2026-06-23",
        dueDate: "2026-07-01",
      },
      invoicePaymentModes: { 3: "payment" },
      invoicePaymentCycleTargets: {
        3: { target: "previous", targetDueDate: "2026-06-01" },
      },
    });

    const fileBill = upserts.find((row) => row.closingDate === "2026-06-23");
    expect(fileBill?.amountDue).toBe(3598.42);
  });

  it("keeps the file closing when payment due matches the CSV cycle", () => {
    const upserts = buildImportedCardStatementCycleUpserts({
      rows: [
        paymentRow({
          sourceLine: 1,
          date: "2026-04-24",
          amount: 3844.33,
        }),
      ],
      billingConfig: {
        statementClosingDay: 25,
        statementDueDay: 3,
      },
      accountId: "card-1",
      ownerUserId: "user-1",
      fileCycle: {
        closingDate: "2026-04-24",
        dueDate: "2026-05-24",
      },
      invoicePaymentModes: { 1: "payment" },
      invoicePaymentCycleTargets: {
        1: { target: "previous", targetDueDate: "2026-05-24" },
      },
    });

    // Must not invent closing 2026-04-25 from statement_closing_day=25.
    expect(upserts).toEqual([
      expect.objectContaining({
        closingDate: "2026-04-24",
        dueDate: "2026-05-24",
        amountDue: null,
      }),
    ]);
  });

  it("does not add an orphan file cycle when payment already covers the same due", () => {
    const upserts = buildImportedCardStatementCycleUpserts({
      rows: [
        paymentRow({
          sourceLine: 1,
          date: "2026-04-24",
          amount: 3844.33,
        }),
      ],
      billingConfig: {
        statementClosingDay: 25,
        statementDueDay: 3,
      },
      accountId: "card-1",
      ownerUserId: "user-1",
      fileCycle: {
        closingDate: "2026-04-24",
        dueDate: "2026-05-24",
      },
      invoicePaymentModes: { 1: "payment" },
      // Force payment onto synthetic closing 04-25 while file is 04-24.
      invoicePaymentCycleTargets: {
        1: { target: "custom", targetDueDate: "2026-05-24" },
      },
    });

    // Regardless of closing chosen for the payment, only one cycle for that due.
    const dues = upserts.filter((row) => row.dueDate === "2026-05-24");
    expect(dues).toHaveLength(1);
  });

  it("skips rows marked as common credit", () => {
    const upserts = buildImportedCardStatementCycleUpserts({
      rows: [
        paymentRow({
          sourceLine: 2,
          date: "2026-08-01",
          amount: 1500,
        }),
      ],
      billingConfig: CONFIG,
      accountId: "card-1",
      ownerUserId: "user-1",
      invoicePaymentModes: { 2: "common" },
    });

    expect(upserts).toHaveLength(0);
  });
});
