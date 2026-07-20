import { describe, expect, it } from "vitest";

import type { Account } from "@/types/account";
import type { Transaction } from "@/types/transaction";

import {
  ALL_ACCOUNTS_FILTER,
  detectInvoicePaymentSignal,
  filterTransactionsByAccount,
  getAccountKindLabel,
  getInvoicePaymentLabel,
  partitionAccountsForFilter,
  resolveAccountFilter,
} from "./lancamentos-filters";

function makeAccount(
  partial: Pick<Account, "id" | "name" | "type">,
): Pick<Account, "id" | "name" | "type"> {
  return partial;
}

function makeTx(
  partial: Pick<Transaction, "id" | "accountId" | "description" | "amount" | "type">,
): Pick<Transaction, "id" | "accountId" | "description" | "amount" | "type"> {
  return partial;
}

describe("partitionAccountsForFilter", () => {
  it("groups bank accounts and credit cards", () => {
    const accounts = [
      makeAccount({ id: "1", name: "Nubank", type: "checking" }),
      makeAccount({ id: "2", name: "Cartão", type: "credit_card" }),
      makeAccount({ id: "3", name: "Poupança", type: "savings" }),
    ];

    const { bankAccounts, creditCards } = partitionAccountsForFilter(accounts);

    expect(bankAccounts.map((account) => account.id)).toEqual(["1", "3"]);
    expect(creditCards.map((account) => account.id)).toEqual(["2"]);
  });
});

describe("filterTransactionsByAccount", () => {
  const checking = makeTx({
    id: "t1",
    accountId: "checking-1",
    description: "Mercado",
    amount: 50,
    type: "expense",
  });
  const card = makeTx({
    id: "t2",
    accountId: "card-1",
    description: "Netflix",
    amount: 40,
    type: "expense",
  });
  const otherCard = makeTx({
    id: "t3",
    accountId: "card-2",
    description: "Uber",
    amount: 20,
    type: "expense",
  });

  it("shows bank + credit card rows for Todas as contas", () => {
    const rows = filterTransactionsByAccount(
      [checking, card, otherCard],
      ALL_ACCOUNTS_FILTER,
    );

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("filters by bank account", () => {
    const rows = filterTransactionsByAccount(
      [checking, card, otherCard],
      "checking-1",
    );

    expect(rows).toEqual([checking]);
  });

  it("filters by credit card", () => {
    const rows = filterTransactionsByAccount(
      [checking, card, otherCard],
      "card-1",
    );

    expect(rows).toEqual([card]);
  });
});

describe("resolveAccountFilter", () => {
  it("falls back to all when the account is unknown", () => {
    expect(resolveAccountFilter("missing", new Set(["a"]))).toBe(
      ALL_ACCOUNTS_FILTER,
    );
    expect(resolveAccountFilter("a", new Set(["a"]))).toBe("a");
    expect(resolveAccountFilter(null, new Set(["a"]))).toBe(
      ALL_ACCOUNTS_FILTER,
    );
  });
});

describe("account kind labels", () => {
  it("labels credit cards as Cartão and others as Conta", () => {
    expect(getAccountKindLabel({ type: "credit_card" })).toBe("Cartão");
    expect(getAccountKindLabel({ type: "checking" })).toBe("Conta");
    expect(getAccountKindLabel(null)).toBe("Conta");
  });
});

describe("invoice payment signals", () => {
  it("detects source and card sides without confusing regular purchases", () => {
    expect(
      detectInvoicePaymentSignal({
        description: "Pagamento fatura (origem) — Pagamento recebido",
      }),
    ).toBe("invoice_payment_source");

    expect(
      detectInvoicePaymentSignal({
        description: "Pagamento recebido",
        accountType: "credit_card",
      }),
    ).toBe("invoice_payment_card");

    expect(
      detectInvoicePaymentSignal({
        description: "Pagamento recebido",
        accountType: "checking",
      }),
    ).toBeNull();

    expect(
      detectInvoicePaymentSignal({
        description: "Netflix.Com",
        accountType: "credit_card",
      }),
    ).toBeNull();
  });

  it("returns readable labels for list badges", () => {
    expect(getInvoicePaymentLabel("invoice_payment_source")).toBe(
      "Pagamento de fatura (origem)",
    );
    expect(getInvoicePaymentLabel("invoice_payment_card")).toBe(
      "Pagamento de fatura",
    );
    expect(getInvoicePaymentLabel(null)).toBeNull();
  });
});
