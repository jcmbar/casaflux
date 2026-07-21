import { describe, expect, it } from "vitest";

import type { Account } from "@/types/account";
import type { Transaction } from "@/types/transaction";

import {
  filterLancamentosTransactions,
  resolveCardStatementPeriodContext,
  resolveContasCardStatementContext,
} from "./lancamentos-card-statement";
import { ALL_ACCOUNTS_FILTER } from "./lancamentos-filters";
import {
  getCurrentStatementCycle,
  getStatementCycleClosingInMonth,
  getStatementSettlement,
  isDateInStatementCycle,
} from "./credit-card-billing";

const config = {
  statementClosingDay: 25,
  statementDueDay: 1,
};

function makeAccount(
  overrides: Partial<Account> & Pick<Account, "id" | "type">,
): Account {
  return {
    name: "Cartão",
    account_mode: "real",
    balance: 0,
    color: null,
    owner_user_id: "user-1",
    family_id: null,
    is_family_shared: false,
    allow_family_view: true,
    allow_family_post: true,
    allow_family_edit: true,
    statement_closing_day: 25,
    statement_due_day: 1,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeTx(
  partial: Pick<
    Transaction,
    "id" | "accountId" | "date" | "type" | "amount" | "description"
  > &
    Partial<Pick<Transaction, "statementCycleId">>,
): Transaction {
  return {
    categoryId: null,
    linkedTransactionId: null,
    createdBy: "user-1",
    familyId: null,
    createdAt: "2026-07-01T00:00:00Z",
    statementCycleId: null,
    ...partial,
  };
}

describe("statement cycle 26/06–25/07 (closing day 25)", () => {
  const cycle = getStatementCycleClosingInMonth(config, "2026-07");

  it("builds period starting 26/06 and ending 25/07", () => {
    expect(cycle).toMatchObject({
      cycleId: "2026-07-25",
      periodStart: "2026-06-26",
      periodEnd: "2026-07-25",
      closingDate: "2026-07-25",
      dueDate: "2026-08-01",
    });
  });

  it("includes border dates and both calendar months", () => {
    expect(isDateInStatementCycle("2026-06-26", cycle)).toBe(true);
    expect(isDateInStatementCycle("2026-06-30", cycle)).toBe(true);
    expect(isDateInStatementCycle("2026-07-01", cycle)).toBe(true);
    expect(isDateInStatementCycle("2026-07-25", cycle)).toBe(true);
    expect(isDateInStatementCycle("2026-06-25", cycle)).toBe(false);
    expect(isDateInStatementCycle("2026-07-26", cycle)).toBe(false);
  });

  it("totals purchases from June and July inside the same cycle", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle,
      referenceDate: "2026-07-20",
      transactions: [
        makeTx({
          id: "jun-1",
          accountId: "card-1",
          date: "2026-06-26",
          type: "expense",
          amount: 1000,
          description: "Compra junho início",
        }),
        makeTx({
          id: "jun-2",
          accountId: "card-1",
          date: "2026-06-30",
          type: "expense",
          amount: 968.42,
          description: "Compra junho fim",
        }),
        makeTx({
          id: "jul-1",
          accountId: "card-1",
          date: "2026-07-10",
          type: "expense",
          amount: 2183.92,
          description: "Compra julho",
        }),
        makeTx({
          id: "out",
          accountId: "card-1",
          date: "2026-06-25",
          type: "expense",
          amount: 999,
          description: "Fora do ciclo estrito — rolled-in",
        }),
        makeTx({
          id: "next",
          accountId: "card-1",
          date: "2026-07-26",
          type: "expense",
          amount: 50,
          description: "Próximo ciclo",
        }),
      ],
    });

    expect(settlement.cyclePurchasesTotal).toBe(4152.34);
    expect(settlement.rolledInPurchasesTotal).toBe(999);
    expect(settlement.amountDueTotal).toBe(5151.34);
    expect(settlement.status).toBe("open");
  });
});

describe("lancamentos card filter uses statement cycle", () => {
  const card = makeAccount({ id: "card-1", type: "credit_card" });
  const checking = makeAccount({
    id: "checking-1",
    type: "checking",
    statement_closing_day: null,
    statement_due_day: null,
  });

  const transactions = [
    makeTx({
      id: "jun",
      accountId: "card-1",
      date: "2026-06-28",
      type: "expense",
      amount: 1968.42,
      description: "Junho no ciclo",
    }),
    makeTx({
      id: "jul",
      accountId: "card-1",
      date: "2026-07-10",
      type: "expense",
      amount: 2183.92,
      description: "Julho no ciclo",
    }),
    makeTx({
      id: "checking-exp",
      accountId: "checking-1",
      date: "2026-07-10",
      type: "expense",
      amount: 40,
      description: "Corrente julho",
    }),
  ];

  it("includes June + July purchases when filtering card by July month", () => {
    const cardStatement = resolveCardStatementPeriodContext({
      account: card,
      period: { mode: "month", monthKey: "2026-07" },
      transactions,
      referenceDate: "2026-07-20",
    });

    expect(cardStatement?.cycle.periodStart).toBe("2026-06-26");
    expect(cardStatement?.cycle.periodEnd).toBe("2026-07-25");
    expect(cardStatement?.settlement.cyclePurchasesTotal).toBe(4152.34);
    expect(cardStatement?.settlement.amountDueTotal).toBe(4152.34);

    const filtered = filterLancamentosTransactions({
      transactions,
      period: { mode: "month", monthKey: "2026-07" },
      accountFilter: "card-1",
      allAccountsFilter: ALL_ACCOUNTS_FILTER,
      cardStatement,
    });

    expect(filtered.map((row) => row.id).sort()).toEqual(["jul", "jun"]);
    expect(
      filtered.reduce((sum, row) => sum + row.amount, 0),
    ).toBe(4152.34);
  });

  it("includes late-June card purchases when filtering Todas as contas by July", () => {
    const filtered = filterLancamentosTransactions({
      transactions,
      period: { mode: "month", monthKey: "2026-07" },
      accountFilter: ALL_ACCOUNTS_FILTER,
      allAccountsFilter: ALL_ACCOUNTS_FILTER,
      cardStatement: null,
      accounts: [card, checking],
    });

    expect(filtered.map((row) => row.id).sort()).toEqual([
      "checking-exp",
      "jul",
      "jun",
    ]);
  });

  it("keeps calendar month filter for checking in Todas as contas view", () => {
    const withCheckingJune = [
      ...transactions,
      makeTx({
        id: "checking-jun",
        accountId: "checking-1",
        date: "2026-06-15",
        type: "expense",
        amount: 12,
        description: "Corrente junho",
      }),
    ];

    const filtered = filterLancamentosTransactions({
      transactions: withCheckingJune,
      period: { mode: "month", monthKey: "2026-07" },
      accountFilter: ALL_ACCOUNTS_FILTER,
      allAccountsFilter: ALL_ACCOUNTS_FILTER,
      cardStatement: null,
      accounts: [card, checking],
    });

    expect(filtered.map((row) => row.id).sort()).toEqual([
      "checking-exp",
      "jul",
      "jun",
    ]);
  });

  it("keeps calendar month filter for non-card accounts", () => {
    const cardStatement = resolveCardStatementPeriodContext({
      account: checking,
      period: { mode: "month", monthKey: "2026-07" },
      transactions,
      referenceDate: "2026-07-20",
    });

    expect(cardStatement).toBeNull();

    const filtered = filterLancamentosTransactions({
      transactions,
      period: { mode: "month", monthKey: "2026-07" },
      accountFilter: "checking-1",
      allAccountsFilter: ALL_ACCOUNTS_FILTER,
      cardStatement: null,
    });

    expect(filtered.map((row) => row.id)).toEqual(["checking-exp"]);
  });

  it("does not use statement cycle when period is all history", () => {
    const cardStatement = resolveCardStatementPeriodContext({
      account: card,
      period: { mode: "all", monthKey: "2026-07" },
      transactions,
      referenceDate: "2026-07-20",
    });

    expect(cardStatement?.usesStatementCycle).toBe(false);

    const filtered = filterLancamentosTransactions({
      transactions,
      period: { mode: "all", monthKey: "2026-07" },
      accountFilter: "card-1",
      allAccountsFilter: ALL_ACCOUNTS_FILTER,
      cardStatement,
    });

    expect(filtered.map((row) => row.id).sort()).toEqual(["jul", "jun"]);
  });
});

describe("Contas card statement matches Lançamentos month view", () => {
  const card = makeAccount({ id: "card-1", type: "credit_card" });
  const checking = makeAccount({
    id: "checking-1",
    type: "checking",
    statement_closing_day: null,
    statement_due_day: null,
  });

  const julyBillPurchases = [
    makeTx({
      id: "jun",
      accountId: "card-1",
      date: "2026-06-28",
      type: "expense",
      amount: 1968.42,
      description: "Junho no ciclo",
    }),
    makeTx({
      id: "jul",
      accountId: "card-1",
      date: "2026-07-10",
      type: "expense",
      amount: 2183.92,
      description: "Julho no ciclo",
    }),
  ];

  it("exposes non-zero settlement for the month that closes with purchases", () => {
    const contas = resolveContasCardStatementContext({
      account: card,
      transactions: julyBillPurchases,
      referenceDate: "2026-07-20",
    });

    expect(contas).not.toBeNull();
    expect(contas!.cycle.cycleId).toBe("2026-07-25");
    expect(contas!.settlement.cyclePurchasesTotal).toBe(4152.34);
    expect(contas!.settlement.amountDueTotal).toBe(4152.34);
    expect(contas!.settlement.remainingTotal).toBe(4152.34);
    expect(contas!.settlement.paidTotal).toBe(0);
  });

  it("stays consistent with Lançamentos month-mode context", () => {
    const referenceDate = "2026-07-28"; // after closing day 25
    const lancamentos = resolveCardStatementPeriodContext({
      account: card,
      period: { mode: "month", monthKey: "2026-07" },
      transactions: julyBillPurchases,
      referenceDate,
    });
    const contas = resolveContasCardStatementContext({
      account: card,
      transactions: julyBillPurchases,
      referenceDate,
    });

    expect(contas?.cycle).toEqual(lancamentos?.cycle);
    expect(contas?.settlement).toEqual(lancamentos?.settlement);
    expect(contas?.settlement.cyclePurchasesTotal).toBe(4152.34);

    // After closing, the accumulating "current" cycle is the next (empty) one —
    // Contas must NOT use that alone, or the card shows zeros.
    const currentOnly = getCurrentStatementCycle(config, referenceDate);
    expect(currentOnly.cycleId).toBe("2026-08-25");
    expect(
      getStatementSettlement({
        accountId: "card-1",
        config,
        cycle: currentOnly,
        transactions: julyBillPurchases,
        referenceDate,
      }).cyclePurchasesTotal,
    ).toBe(0);
    expect(contas?.cycle.cycleId).toBe(
      getStatementCycleClosingInMonth(config, "2026-07").cycleId,
    );
  });

  it("returns null for non-card accounts", () => {
    expect(
      resolveContasCardStatementContext({
        account: checking,
        transactions: julyBillPurchases,
        referenceDate: "2026-07-20",
      }),
    ).toBeNull();
  });
});
