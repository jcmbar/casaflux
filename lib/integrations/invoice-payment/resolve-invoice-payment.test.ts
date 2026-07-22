import { describe, expect, it } from "vitest";

import { getStatementSettlement } from "@/lib/finance/credit-card-billing";
import { buildImportPreview } from "../core/import-orchestrator";
import {
  buildCommitImportRpcPayload,
  getCommitImportPreviewValidationError,
} from "../commit/commit-import-preview";
import {
  getCommittableImportRows,
  mapImportRowToTransactions,
} from "../commit/map-import-row";
import { hashImportContent } from "../history/hash-content";
import {
  isCreditCardInvoicePaymentCandidate,
  resolveImportedInvoicePayment,
} from "./resolve-invoice-payment";

const CARD_ACCOUNT_ID = "card-account-1";
const SOURCE_CHECKING_ID = "checking-source-1";

const billingConfig = {
  statementClosingDay: 25,
  statementDueDay: 3,
};

describe("credit card invoice payment detection", () => {
  it("detects Pagamento recebido credit as candidate", () => {
    expect(
      isCreditCardInvoicePaymentCandidate({
        description: "Pagamento recebido",
        direction: "in",
        source: "nubank_credit_card",
      }),
    ).toBe(true);
  });

  it("does not classify purchase-like rows as payment", () => {
    expect(
      isCreditCardInvoicePaymentCandidate({
        description: "Mercado",
        direction: "out",
        source: "nubank_credit_card",
      }),
    ).toBe(false);

    expect(
      isCreditCardInvoicePaymentCandidate({
        description: "Pagamento recebido",
        direction: "out",
        source: "nubank_credit_card",
      }),
    ).toBe(false);
  });

  it("marks real CSV Pagamento recebido as card_invoice_payment needing account", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-06-26,Pagamento recebido,"- 3.598,45"',
        '2026-07-01,Store,"10,00"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const payment = preview.rows.find(
      (row) => row.description === "Pagamento recebido",
    );
    expect(payment?.kind).toBe("card_invoice_payment");
    expect(payment?.direction).toBe("in");
    expect(payment?.reviewStatus).toBe("needs_account");
    expect(payment?.amount).toBe(3598.45);

    const purchase = preview.rows.find((row) => row.description === "Store");
    expect(purchase?.kind).toBe("card_purchase");
  });
});

describe("resolveImportedInvoicePayment → previous statement", () => {
  it("links 2026-06-26 payment to cycle closing 25/06 due 03/07", () => {
    const resolution = resolveImportedInvoicePayment({
      paymentDate: "2026-06-26",
      billingConfig,
    });

    expect(resolution).toMatchObject({
      cycleId: "2026-06-25",
      dueDateLabel: "03/07/2026",
      periodLabel: "26/05–25/06",
      confidence: "high",
    });
  });

  it("returns null when card billing is not configured", () => {
    expect(
      resolveImportedInvoicePayment({
        paymentDate: "2026-06-26",
        billingConfig: null,
      }),
    ).toBeNull();
  });
});

describe("invoice payment commit + statement settlement", () => {
  it("requires source account when confirming as payment", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-06-26,Pagamento recebido,"- 3.598,45"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    expect(getCommittableImportRows(preview.rows, {})).toHaveLength(0);
    expect(
      getCommittableImportRows(preview.rows, {
        [preview.rows[0]!.sourceLine]: SOURCE_CHECKING_ID,
      }),
    ).toHaveLength(1);

    expect(
      getCommitImportPreviewValidationError({
        preview,
        targetAccountId: CARD_ACCOUNT_ID,
        invoiceSourceAccounts: {},
        ownerUserId: "user-1",
        familyId: null,
        fileName: "card.csv",
        contentHash: hashImportContent("x"),
        statementFileCycle: {
          closingDate: "2026-06-25",
          dueDate: "2026-07-03",
        },
      }),
    ).toMatch(/origem/i);
  });

  it("maps payment to previous cycle and updates paid/remaining/status", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-06-26,Pagamento recebido,"- 3.598,45"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const paymentRow = preview.rows[0]!;
    const drafts = mapImportRowToTransactions(
      paymentRow,
      CARD_ACCOUNT_ID,
      SOURCE_CHECKING_ID,
      billingConfig,
      "payment",
    );

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      accountId: SOURCE_CHECKING_ID,
      type: "expense",
      amount: 3598.45,
      statementCycleId: "2026-06-25",
    });
    expect(drafts[1]).toMatchObject({
      accountId: CARD_ACCOUNT_ID,
      type: "income",
      amount: 3598.45,
      statementCycleId: "2026-06-25",
    });

    const cycle = resolveImportedInvoicePayment({
      paymentDate: "2026-06-26",
      billingConfig,
    })!.cycle;

    const settlement = getStatementSettlement({
      accountId: CARD_ACCOUNT_ID,
      config: billingConfig,
      cycle,
      referenceDate: "2026-07-01",
      transactions: [
        {
          accountId: CARD_ACCOUNT_ID,
          date: "2026-06-10",
          type: "expense",
          amount: 3598.45,
          description: "Compras fatura anterior",
        },
        {
          accountId: CARD_ACCOUNT_ID,
          date: "2026-06-26",
          type: "income",
          amount: 3598.45,
          description: "Pagamento recebido",
          statementCycleId: "2026-06-25",
        },
      ],
    });

    expect(settlement.paidTotal).toBe(3598.45);
    expect(settlement.remainingTotal).toBe(0);
    expect(settlement.status).toBe("paid");
  });

  it("allows importing as common income without source account", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-06-26,Pagamento recebido,"- 100,00"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const line = preview.rows[0]!.sourceLine;
    expect(
      getCommittableImportRows(preview.rows, {}, { [line]: "common" }),
    ).toHaveLength(1);

    const drafts = mapImportRowToTransactions(
      preview.rows[0]!,
      CARD_ACCOUNT_ID,
      undefined,
      billingConfig,
      "common",
    );

    expect(drafts).toMatchObject([
      {
        accountId: CARD_ACCOUNT_ID,
        type: "income",
        amount: 100,
        description: "Pagamento recebido",
      },
    ]);
    expect(drafts[0]?.statementCycleId).toBeUndefined();

    const payload = buildCommitImportRpcPayload({
      preview,
      targetAccountId: CARD_ACCOUNT_ID,
      invoiceSourceAccounts: {},
      invoicePaymentModes: { [line]: "common" },
      ownerUserId: "user-1",
      familyId: null,
      fileName: "card.csv",
      contentHash: hashImportContent("hash"),
      targetAccount: {
        type: "credit_card",
        statement_closing_day: 25,
        statement_due_day: 3,
      },
    });

    expect(payload[0]?.kind).toBe("card_purchase");
    expect(payload[0]?.transactions).toHaveLength(1);
  });

  it("keeps normal card purchases unchanged on commit", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-07-01,Store,"10,00"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const payload = buildCommitImportRpcPayload({
      preview,
      targetAccountId: CARD_ACCOUNT_ID,
      invoiceSourceAccounts: {},
      ownerUserId: "user-1",
      familyId: null,
      fileName: "card.csv",
      contentHash: hashImportContent("hash"),
      targetAccount: {
        type: "credit_card",
        statement_closing_day: 25,
        statement_due_day: 3,
      },
    });

    expect(payload).toHaveLength(1);
    expect(payload[0]?.transactions).toEqual([
      expect.objectContaining({
        account_id: CARD_ACCOUNT_ID,
        type: "expense",
        amount: 10,
        statement_cycle_id: null,
      }),
    ]);
  });
});
