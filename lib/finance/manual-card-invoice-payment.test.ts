import { describe, expect, it } from "vitest";

import { buildCreateTransactionInsertRow } from "./create-transaction";
import {
  getManualCardInvoicePaymentValidationError,
  inferManualCardInvoicePaymentFormFields,
  resolveManualCardInvoicePaymentPersistFields,
} from "./manual-card-invoice-payment";
import {
  getStatementSettlement,
  isPaymentAttributedToStatementCycle,
  isTransactionInStatementCycleView,
} from "./credit-card-billing";

const config = {
  statementClosingDay: 20,
  statementDueDay: 27,
};

const julyCycle = {
  cycleId: "2026-07-20",
  periodStart: "2026-06-21",
  periodEnd: "2026-07-20",
  closingDate: "2026-07-20",
  dueDate: "2026-07-27",
};

describe("resolveManualCardInvoicePaymentPersistFields", () => {
  it("clears linkage when checkbox is off", () => {
    expect(
      resolveManualCardInvoicePaymentPersistFields({
        isInvoicePayment: false,
        invoiceDueDate: "2026-07-27",
        invoiceCycleId: "2026-07-20",
      }),
    ).toEqual({
      invoicePaymentOrigin: null,
      statementDueDate: null,
      statementCycleId: null,
    });
  });

  it("persists manual origin with due and cycle when checked", () => {
    expect(
      resolveManualCardInvoicePaymentPersistFields({
        isInvoicePayment: true,
        invoiceDueDate: "2026-07-27",
        invoiceCycleId: "2026-07-20",
      }),
    ).toEqual({
      invoicePaymentOrigin: "manual",
      statementDueDate: "2026-07-27",
      statementCycleId: "2026-07-20",
    });
  });

  it("requires a due date when checked", () => {
    expect(
      getManualCardInvoicePaymentValidationError({
        isInvoicePayment: true,
        invoiceDueDate: "",
        invoiceCycleId: "",
      }),
    ).toMatch(/fatura/i);

    expect(
      getManualCardInvoicePaymentValidationError({
        isInvoicePayment: true,
        invoiceDueDate: "",
        invoiceCycleId: "2026-07-20",
      }),
    ).toBeNull();
  });
});

describe("inferManualCardInvoicePaymentFormFields", () => {
  it("pre-checks when editing an invoice payment income", () => {
    expect(
      inferManualCardInvoicePaymentFormFields({
        type: "income",
        invoicePaymentOrigin: "manual",
        statementDueDate: "2026-01-27",
        statementCycleId: "2026-01-20",
      }),
    ).toEqual({
      isInvoicePayment: true,
      invoiceDueDate: "2026-01-27",
      invoiceCycleId: "2026-01-20",
    });
  });
});

describe("createTransaction invoice payment payload", () => {
  it("includes origin and due date in the insert row", () => {
    expect(
      buildCreateTransactionInsertRow({
        description: "Ajuste de valores",
        amount: 247.34,
        type: "income",
        categoryId: "cat-1",
        accountId: "card-1",
        transactionDate: "2026-01-27",
        userId: "user-1",
        familyId: null,
        invoicePaymentOrigin: "manual",
        statementDueDate: "2026-01-27",
        statementCycleId: "2026-01-20",
      }),
    ).toMatchObject({
      invoice_payment_origin: "manual",
      statement_due_date: "2026-01-27",
      statement_cycle_id: "2026-01-20",
      type: "income",
      amount: 247.34,
    });
  });
});

describe("manual card credit marked as invoice payment", () => {
  it("appears in cycle view and reduces remaining when linked", () => {
    const adjustment = {
      accountId: "card-1",
      date: "2026-01-27",
      type: "income" as const,
      amount: 247.34,
      description: "Ajuste de valores",
      invoicePaymentOrigin: "manual" as const,
      statementDueDate: "2026-07-27",
      statementCycleId: "2026-07-20",
    };

    expect(
      isPaymentAttributedToStatementCycle({
        accountId: "card-1",
        cycle: julyCycle,
        config,
        transaction: adjustment,
      }),
    ).toBe(true);

    expect(
      isTransactionInStatementCycleView({
        accountId: "card-1",
        cycle: julyCycle,
        config,
        transaction: adjustment,
      }),
    ).toBe(true);

    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle: julyCycle,
      referenceDate: "2026-07-28",
      transactions: [
        {
          accountId: "card-1",
          date: "2026-07-10",
          type: "expense",
          amount: 500,
        },
        adjustment,
      ],
    });

    expect(settlement.paidTotal).toBe(247.34);
    expect(settlement.remainingTotal).toBe(252.66);
  });
});
