import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/types/account";
import type { Transaction } from "@/types/transaction";

import {
  getOpenStatementPurchaseWindow,
  getStatementCycleClosingInMonth,
  getStatementSettlement,
} from "./credit-card-billing";
import {
  fetchAllTransactionsForAccounts,
  TRANSACTIONS_PAGE_SIZE,
} from "./fetch-transactions";
import {
  filterLancamentosTransactions,
  resolveCardStatementPeriodContext,
} from "./lancamentos-card-statement";
import { ALL_ACCOUNTS_FILTER } from "./lancamentos-filters";

describe("fetchAllTransactionsForAccounts", () => {
  it("pages past the API max_rows limit so older rows are not truncated", async () => {
    const page1 = Array.from({ length: TRANSACTIONS_PAGE_SIZE }, (_, i) => ({
      id: `p1-${i}`,
      account_id: "card-1",
    }));
    const page2 = [{ id: "june-purchase", account_id: "card-1" }];

    const rangeMock = vi
      .fn()
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });

    const orderMock = vi.fn(() => ({ order: orderMock, range: rangeMock }));
    const inMock = vi.fn(() => ({ order: orderMock }));
    const selectMock = vi.fn(() => ({ in: inMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));

    const result = await fetchAllTransactionsForAccounts(
      { from: fromMock } as never,
      { accountIds: ["card-1"], select: "*" },
    );

    expect(result.paginated).toBe(true);
    expect(result.data).toHaveLength(TRANSACTIONS_PAGE_SIZE + 1);
  });
});

describe("open statement: cycle expenses vs amount due", () => {
  const config = { statementClosingDay: 25, statementDueDay: 3 };
  const cycle = getStatementCycleClosingInMonth(config, "2026-07");

  const card = {
    id: "card-1",
    name: "Cartão de Crédito Nubank",
    type: "credit_card",
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
    statement_due_day: 3,
    created_at: "2026-01-01T00:00:00Z",
  } satisfies Account;

  function expense(
    partial: Pick<Transaction, "id" | "date" | "amount" | "description">,
  ): Transaction {
    return {
      accountId: "card-1",
      type: "expense",
      categoryId: null,
      linkedTransactionId: null,
      createdBy: "user-1",
      familyId: null,
      createdAt: "2026-07-01T00:00:00Z",
      statementCycleId: null,
      ...partial,
    };
  }

  const rolledIn = [
    expense({
      id: "prev-1",
      date: "2026-06-24",
      amount: 1208.31,
      description: "Parcelas 24/06",
    }),
    expense({
      id: "prev-2",
      date: "2026-06-25",
      amount: 66.73,
      description: "Coop 25/06",
    }),
  ];

  const cyclePurchases = [
    expense({
      id: "cur-jun",
      date: "2026-06-28",
      amount: 693.35,
      description: "Junho no ciclo",
    }),
    expense({
      id: "cur-jul",
      date: "2026-07-10",
      amount: 2183.92,
      description: "Julho no ciclo",
    }),
  ];

  it("opens purchase window on day before previous closing through period end", () => {
    expect(getOpenStatementPurchaseWindow({
      cycle,
      closingDay: 25,
    })).toEqual({
      previousClosing: "2026-06-25",
      windowStart: "2026-06-24",
      windowEnd: "2026-07-25",
    });
  });

  it("separates cycle expenses (2877.27) from amount due (4152.31)", () => {
    const settlement = getStatementSettlement({
      accountId: "card-1",
      config,
      cycle,
      referenceDate: "2026-07-20",
      transactions: [...rolledIn, ...cyclePurchases],
    });

    expect(settlement.cyclePurchasesTotal).toBe(2877.27);
    expect(settlement.purchasesTotal).toBe(2877.27);
    expect(settlement.rolledInPurchasesTotal).toBe(1275.04);
    expect(settlement.amountDueTotal).toBe(4152.31);
    expect(settlement.remainingTotal).toBe(4152.31);
    expect(settlement.status).toBe("open");
  });

  it("/lancamentos card context exposes both totals for the UI", () => {
    const transactions = [...rolledIn, ...cyclePurchases];
    const cardStatement = resolveCardStatementPeriodContext({
      account: card,
      period: { mode: "month", monthKey: "2026-07" },
      transactions,
      referenceDate: "2026-07-20",
    });

    expect(cardStatement?.settlement.cyclePurchasesTotal).toBe(2877.27);
    expect(cardStatement?.settlement.amountDueTotal).toBe(4152.31);

    const list = filterLancamentosTransactions({
      transactions,
      period: { mode: "month", monthKey: "2026-07" },
      accountFilter: "card-1",
      allAccountsFilter: ALL_ACCOUNTS_FILTER,
      cardStatement,
    });

    expect(list.map((row) => row.id).sort()).toEqual([
      "cur-jul",
      "cur-jun",
      "prev-1",
      "prev-2",
    ]);
  });

  it("does not change non-card month filtering", () => {
    const checking = {
      ...card,
      id: "checking-1",
      type: "checking" as const,
      statement_closing_day: null,
      statement_due_day: null,
    };

    const transactions = [
      expense({
        id: "card-x",
        date: "2026-07-10",
        amount: 10,
        description: "Card",
      }),
      {
        ...expense({
          id: "chk",
          date: "2026-07-10",
          amount: 40,
          description: "Checking",
        }),
        accountId: "checking-1",
      },
    ];

    expect(
      resolveCardStatementPeriodContext({
        account: checking,
        period: { mode: "month", monthKey: "2026-07" },
        transactions,
        referenceDate: "2026-07-20",
      }),
    ).toBeNull();

    const filtered = filterLancamentosTransactions({
      transactions,
      period: { mode: "month", monthKey: "2026-07" },
      accountFilter: "checking-1",
      allAccountsFilter: ALL_ACCOUNTS_FILTER,
      cardStatement: null,
    });

    expect(filtered.map((row) => row.id)).toEqual(["chk"]);
  });
});
