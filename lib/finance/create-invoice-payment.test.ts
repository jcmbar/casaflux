import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deriveStatementStatus,
  getStatementSettlement,
  shouldCountPaymentTowardSettlement,
  type CreditCardBillingConfig,
} from "@/lib/finance/credit-card-billing";
import {
  createCreditCardInvoicePayment,
  getInvoicePaymentSourceAccounts,
  getInvoicePaymentValidationError,
  isInvoicePaymentSourceEligibleAccount,
  resolveInvoicePaymentTarget,
} from "@/lib/finance/create-invoice-payment";

const CARD = {
  id: "card-1",
  type: "credit_card" as const,
  statement_closing_day: 25,
  statement_due_day: 1,
};

const CONFIG: CreditCardBillingConfig = {
  statementClosingDay: 25,
  statementDueDay: 1,
};

const CHECKING = {
  id: "checking-1",
  type: "checking" as const,
  account_mode: "real" as const,
  is_family_shared: false,
  allow_family_post: false,
  owner_user_id: "user-1",
};

describe("manual invoice payment", () => {
  it("requires a source account different from the card", () => {
    expect(
      getInvoicePaymentValidationError({
        amount: 100,
        sourceAccountId: "",
        cardAccountId: CARD.id,
        paymentDate: "2026-08-01",
        statementCycleId: "2026-07-25",
        hasBillingConfig: true,
      }),
    ).toMatch(/conta de origem/i);

    expect(
      getInvoicePaymentValidationError({
        amount: 100,
        sourceAccountId: CARD.id,
        cardAccountId: CARD.id,
        paymentDate: "2026-08-01",
        statementCycleId: "2026-07-25",
        hasBillingConfig: true,
      }),
    ).toMatch(/diferente do cartão/i);
  });

  it("requires a positive amount and a valid payment date", () => {
    expect(
      getInvoicePaymentValidationError({
        amount: 0,
        sourceAccountId: "checking-1",
        cardAccountId: CARD.id,
        paymentDate: "2026-08-01",
        statementCycleId: "2026-07-25",
        hasBillingConfig: true,
      }),
    ).toMatch(/valor válido/i);

    expect(
      getInvoicePaymentValidationError({
        amount: 50,
        sourceAccountId: "checking-1",
        cardAccountId: CARD.id,
        paymentDate: "01/08/2026",
        statementCycleId: "2026-07-25",
        hasBillingConfig: true,
      }),
    ).toMatch(/data/i);
  });

  it("blocks ineligible source accounts with a specific message", () => {
    expect(
      isInvoicePaymentSourceEligibleAccount(
        { ...CHECKING, type: "credit_card" },
        "user-1",
      ),
    ).toBe(false);

    expect(
      isInvoicePaymentSourceEligibleAccount(
        { ...CHECKING, account_mode: "forecast" },
        "user-1",
      ),
    ).toBe(false);

    expect(
      getInvoicePaymentValidationError({
        amount: 100,
        sourceAccountId: CHECKING.id,
        cardAccountId: CARD.id,
        paymentDate: "2026-08-01",
        statementCycleId: "2026-07-25",
        hasBillingConfig: true,
        sourceAccount: { ...CHECKING, owner_user_id: "other-user" },
        userId: "user-1",
      }),
    ).toMatch(/não pode ser usada como origem/i);
  });

  it("reuses transfer eligibility for source account lists", () => {
    const accounts = [
      CHECKING,
      {
        id: "card-x",
        type: "credit_card" as const,
        account_mode: "real" as const,
        is_family_shared: false,
        allow_family_post: false,
        owner_user_id: "user-1",
      },
      {
        id: "forecast-1",
        type: "checking" as const,
        account_mode: "forecast" as const,
        is_family_shared: false,
        allow_family_post: false,
        owner_user_id: "user-1",
      },
      {
        id: "cash-1",
        type: "cash" as const,
        account_mode: "real" as const,
        is_family_shared: false,
        allow_family_post: false,
        owner_user_id: "user-1",
      },
    ];

    expect(
      getInvoicePaymentSourceAccounts(accounts, "user-1").map((a) => a.id),
    ).toEqual(["checking-1", "cash-1"]);
  });

  it("links to the UI fatura cycle even when payment date would pick another cycle", () => {
    const target = resolveInvoicePaymentTarget({
      cardAccount: CARD,
      // Before closing → date-based would pick previous cycle (2026-06-25).
      paymentDate: "2026-07-10",
      statementCycleId: "2026-07-25",
    });

    expect(target?.statementCycleId).toBe("2026-07-25");
    expect(target?.cycle.periodStart).toBe("2026-06-26");
    expect(target?.cycle.periodEnd).toBe("2026-07-25");
    expect(target?.cycle.dueDate).toBe("2026-08-01");
  });

  it("falls back to payment-date cycle when UI cycle is omitted", () => {
    const target = resolveInvoicePaymentTarget({
      cardAccount: CARD,
      paymentDate: "2026-07-26",
    });

    expect(target?.statementCycleId).toBe("2026-07-25");
  });

  it("updates settlement to paid after a full manual payment", () => {
    const cycle = resolveInvoicePaymentTarget({
      cardAccount: CARD,
      paymentDate: "2026-08-01",
      statementCycleId: "2026-07-25",
    })!.cycle;

    const settlement = getStatementSettlement({
      accountId: CARD.id,
      config: CONFIG,
      cycle,
      referenceDate: "2026-08-01",
      transactions: [
        {
          accountId: CARD.id,
          type: "expense",
          amount: 200,
          date: "2026-07-10",
        },
        {
          accountId: CARD.id,
          type: "income",
          amount: 200,
          date: "2026-08-01",
          statementCycleId: "2026-07-25",
          invoicePaymentOrigin: "manual",
        },
      ],
    });

    expect(settlement.amountDueTotal).toBe(200);
    expect(settlement.paidTotal).toBe(200);
    expect(settlement.remainingTotal).toBe(0);
    expect(settlement.status).toBe("paid");
  });

  it("updates settlement to partial after a partial manual payment", () => {
    const cycle = resolveInvoicePaymentTarget({
      cardAccount: CARD,
      paymentDate: "2026-08-01",
      statementCycleId: "2026-07-25",
    })!.cycle;

    const settlement = getStatementSettlement({
      accountId: CARD.id,
      config: CONFIG,
      cycle,
      referenceDate: "2026-08-01",
      transactions: [
        {
          accountId: CARD.id,
          type: "expense",
          amount: 200,
          date: "2026-07-10",
        },
        {
          accountId: CARD.id,
          type: "income",
          amount: 80,
          date: "2026-08-01",
          statementCycleId: "2026-07-25",
          invoicePaymentOrigin: "manual",
        },
      ],
    });

    expect(settlement.paidTotal).toBe(80);
    expect(settlement.remainingTotal).toBe(120);
    expect(settlement.status).toBe("partial");
    expect(
      deriveStatementStatus({
        purchasesTotal: settlement.amountDueTotal,
        paidTotal: settlement.paidTotal,
        dueDate: cycle.dueDate,
        referenceDate: "2026-08-01",
      }),
    ).toBe("partial");
  });

  it("does not double-count a reconciled manual twin of an imported payment", () => {
    expect(
      shouldCountPaymentTowardSettlement({
        invoicePaymentOrigin: "manual",
        reconciledWithTransactionId: "imported-leg",
      }),
    ).toBe(false);

    expect(
      shouldCountPaymentTowardSettlement({
        invoicePaymentOrigin: "imported",
        reconciledWithTransactionId: "manual-leg",
      }),
    ).toBe(true);

    expect(
      shouldCountPaymentTowardSettlement({
        invoicePaymentOrigin: "manual",
        reconciledWithTransactionId: null,
      }),
    ).toBe(true);

    const cycle = resolveInvoicePaymentTarget({
      cardAccount: CARD,
      paymentDate: "2026-08-01",
      statementCycleId: "2026-07-25",
    })!.cycle;

    const settlement = getStatementSettlement({
      accountId: CARD.id,
      config: CONFIG,
      cycle,
      referenceDate: "2026-08-01",
      transactions: [
        {
          accountId: CARD.id,
          type: "expense",
          amount: 100,
          date: "2026-07-10",
        },
        {
          accountId: CARD.id,
          type: "income",
          amount: 100,
          date: "2026-07-28",
          statementCycleId: "2026-07-25",
          invoicePaymentOrigin: "manual",
          reconciledWithTransactionId: "imported-1",
        },
        {
          accountId: CARD.id,
          type: "income",
          amount: 100,
          date: "2026-07-28",
          statementCycleId: "2026-07-25",
          invoicePaymentOrigin: "imported",
          reconciledWithTransactionId: "manual-1",
        },
      ],
    });

    expect(settlement.paidTotal).toBe(100);
    expect(settlement.remainingTotal).toBe(0);
    expect(settlement.status).toBe("paid");
    expect(settlement.paymentCount).toBe(1);
  });
});

describe("createCreditCardInvoicePayment RPC payload", () => {
  it("sends the selected source account and cycle to the shared RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        sourceTransactionId: "tx-source",
        cardTransactionId: "tx-card",
        statementCycleId: "2026-07-25",
        origin: "manual",
      },
      error: null,
    });

    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await createCreditCardInvoicePayment(supabase, {
      cardAccount: CARD,
      sourceAccountId: CHECKING.id,
      sourceAccount: CHECKING,
      amount: 150.5,
      paymentDate: "2026-08-01",
      userId: "user-1",
      statementCycleId: "2026-07-25",
      notes: "pago no app",
      origin: "manual",
    });

    expect(result).toEqual({
      ok: true,
      statementCycleId: "2026-07-25",
      statementDueDate: "2026-08-01",
      sourceTransactionId: "tx-source",
      cardTransactionId: "tx-card",
      origin: "manual",
    });

    expect(rpc).toHaveBeenCalledWith("create_credit_card_invoice_payment", {
      p_card_account_id: CARD.id,
      p_source_account_id: CHECKING.id,
      p_amount: 150.5,
      p_payment_date: "2026-08-01",
      p_statement_cycle_id: "2026-07-25",
      p_statement_due_date: "2026-08-01",
      p_notes: "pago no app",
      p_origin: "manual",
    });
  });

  it("maps origin permission failures to a specific message", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Not allowed to post to origin account" },
      }),
    } as unknown as SupabaseClient;

    const result = await createCreditCardInvoicePayment(supabase, {
      cardAccount: CARD,
      sourceAccountId: CHECKING.id,
      sourceAccount: CHECKING,
      amount: 10,
      paymentDate: "2026-08-01",
      userId: "user-1",
      statementCycleId: "2026-07-25",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/permissão.*origem/i);
    }
  });
});
