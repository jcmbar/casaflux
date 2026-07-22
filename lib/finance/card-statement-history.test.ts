import { describe, expect, it } from "vitest";

import {
  buildCardStatementHistory,
  buildCardStatementHistoryDetail,
  buildFaturasHref,
  extractInvoicePaymentNotes,
  filterCardStatementHistory,
  getFaturasListEmptyMessage,
  listStatementCyclePayments,
  parseFaturasListFilter,
  type StatementHistoryTransaction,
} from "./card-statement-history";

const CARD = {
  id: "card-1",
  name: "Nubank Cartão",
  type: "credit_card" as const,
  statement_closing_day: 25,
  statement_due_day: 1,
};

const CYCLE_JUL = "2026-07-25";
const CYCLE_JUN = "2026-06-25";

function tx(
  partial: Partial<StatementHistoryTransaction> &
    Pick<StatementHistoryTransaction, "id" | "type" | "amount" | "date">,
): StatementHistoryTransaction {
  return {
    accountId: CARD.id,
    description: "Pagamento recebido",
    notes: null,
    linkedTransactionId: null,
    statementCycleId: null,
    statementDueDate: null,
    invoicePaymentOrigin: null,
    reconciledWithTransactionId: null,
    ...partial,
  };
}

describe("buildCardStatementHistory", () => {
  it("lists cycles with status and totals, newest first", () => {
    const history = buildCardStatementHistory({
      cardAccount: CARD,
      referenceDate: "2026-08-10",
      transactions: [
        tx({
          id: "e1",
          type: "expense",
          amount: 200,
          date: "2026-07-10",
        }),
        tx({
          id: "e2",
          type: "expense",
          amount: 100,
          date: "2026-06-10",
        }),
        tx({
          id: "p1",
          type: "income",
          amount: 200,
          date: "2026-08-01",
          statementCycleId: CYCLE_JUL,
          invoicePaymentOrigin: "imported",
        }),
      ],
    });

    expect(history).not.toBeNull();
    expect(history!.map((item) => item.cycle.cycleId)).toContain(CYCLE_JUL);
    expect(history!.map((item) => item.cycle.cycleId)).toContain(CYCLE_JUN);

    const july = history!.find((item) => item.cycle.cycleId === CYCLE_JUL)!;
    expect(july.periodLabel).toBe("26/06–25/07");
    expect(july.settlement.amountDueTotal).toBe(200);
    expect(july.settlement.paidTotal).toBe(200);
    expect(july.status).toBe("paid");
    expect(july.statusLabel).toBe("Paga");

    const june = history!.find((item) => item.cycle.cycleId === CYCLE_JUN)!;
    expect(june.settlement.amountDueTotal).toBe(100);
    expect(june.status).toBe("overdue");
  });

  it("prefers imported cycle totals so fully paid bills stay paid", () => {
    const history = buildCardStatementHistory({
      cardAccount: CARD,
      referenceDate: "2026-08-10",
      transactions: [
        // Synthetic window may miss this purchase date relative to closing day,
        // but issuer amount + payment should still settle as paid when there
        // are no in-window purchases.
        tx({
          id: "e1",
          type: "expense",
          amount: 50,
          date: "2026-06-10",
        }),
        tx({
          id: "p1",
          type: "income",
          amount: 1500,
          date: "2026-08-01",
          statementCycleId: CYCLE_JUL,
          invoicePaymentOrigin: "imported",
        }),
      ],
      importedCycles: [
        {
          id: "imp-1",
          accountId: CARD.id,
          ownerUserId: "user-1",
          familyId: null,
          closingDate: CYCLE_JUL,
          periodStart: "2026-06-26",
          periodEnd: CYCLE_JUL,
          dueDate: "2026-08-01",
          amountDue: 1500,
          source: "imported",
          importBatchId: "batch-1",
          notes: null,
        },
      ],
    });

    const july = history!.find((item) => item.cycle.cycleId === CYCLE_JUL)!;
    expect(july.usesImportedCycle).toBe(true);
    expect(july.cycle.dueDate).toBe("2026-08-01");
    expect(july.settlement.amountDueTotal).toBe(1500);
    expect(july.settlement.paidTotal).toBe(1500);
    expect(july.status).toBe("paid");
  });

  it("does not double-count virada purchases on closed cycles in history", () => {
    const history = buildCardStatementHistory({
      cardAccount: CARD,
      referenceDate: "2026-08-10",
      transactions: [
        // Lives in June cycle period AND would roll into July open window.
        tx({
          id: "e-virada",
          type: "expense",
          amount: 863.46,
          date: "2026-06-25",
        }),
        tx({
          id: "e-july",
          type: "expense",
          amount: 100,
          date: "2026-07-10",
        }),
      ],
    });

    const june = history!.find((item) => item.cycle.cycleId === CYCLE_JUN)!;
    const july = history!.find((item) => item.cycle.cycleId === CYCLE_JUL)!;

    expect(june.settlement.amountDueTotal).toBe(863.46);
    // July is current for referenceDate 2026-08-10? current for Aug 10 with
    // closing 25 is July cycle still open until... getCurrentStatementCycle
    // for 2026-08-10 with closing day 25 → cycle closing 2026-08-25.
    // So July is closed; no rolled-in on July.
    expect(july.isCurrent).toBe(false);
    expect(july.settlement.amountDueTotal).toBe(100);
    expect(july.settlement.rolledInPurchasesTotal).toBe(0);
  });

  it("uses imported bill total (issuer or payment) instead of partial purchase window", () => {
    const history = buildCardStatementHistory({
      cardAccount: CARD,
      referenceDate: "2026-08-10",
      transactions: [
        tx({
          id: "e1",
          type: "expense",
          amount: 820.48,
          date: "2026-07-10",
        }),
        tx({
          id: "e2",
          type: "expense",
          amount: 100,
          date: "2026-07-12",
        }),
        tx({
          id: "p1",
          type: "income",
          amount: 3844.33,
          date: "2026-08-01",
          statementCycleId: CYCLE_JUL,
          invoicePaymentOrigin: "imported",
        }),
      ],
      importedCycles: [
        {
          id: "imp-1",
          accountId: CARD.id,
          ownerUserId: "user-1",
          familyId: null,
          closingDate: CYCLE_JUL,
          periodStart: "2026-06-26",
          periodEnd: CYCLE_JUL,
          dueDate: "2026-08-01",
          amountDue: 3844.33,
          source: "imported",
          importBatchId: "batch-1",
          notes: null,
        },
      ],
    });

    const july = history!.find((item) => item.cycle.cycleId === CYCLE_JUL)!;
    expect(july.settlement.amountDueTotal).toBe(3844.33);
    expect(july.settlement.paidTotal).toBe(3844.33);
    expect(july.settlement.remainingTotal).toBe(0);
    expect(july.status).toBe("paid");
  });

  it("drops orphan file-cycle siblings that share the same due date", () => {
    const history = buildCardStatementHistory({
      cardAccount: {
        ...CARD,
        statement_due_day: 3,
      },
      referenceDate: "2026-07-21",
      transactions: [
        tx({
          id: "e-partial",
          type: "expense",
          amount: 863.46,
          date: "2026-04-10",
        }),
        tx({
          id: "e-orphan",
          type: "expense",
          amount: 820.48,
          date: "2026-04-05",
        }),
        tx({
          id: "pay",
          type: "income",
          amount: 3844.33,
          date: "2026-04-24",
          statementCycleId: "2026-04-25",
          invoicePaymentOrigin: "imported",
        }),
      ],
      importedCycles: [
        {
          id: "file",
          accountId: CARD.id,
          ownerUserId: "user-1",
          familyId: null,
          closingDate: "2026-04-24",
          periodStart: "2026-03-26",
          periodEnd: "2026-04-24",
          dueDate: "2026-05-24",
          amountDue: null,
          source: "imported",
          importBatchId: "batch-1",
          notes: "Ciclo do arquivo (fechamento 2026-04-24, vencimento 2026-05-24).",
        },
        {
          id: "paid",
          accountId: CARD.id,
          ownerUserId: "user-1",
          familyId: null,
          closingDate: "2026-04-25",
          periodStart: "2026-03-26",
          periodEnd: "2026-04-25",
          dueDate: "2026-05-24",
          amountDue: null,
          source: "imported",
          importBatchId: "batch-1",
          notes: "Ciclo capturado na importação (fechamento 2026-04-24, vencimento 2026-05-24).",
        },
      ],
    });

    const ids = history!.map((item) => item.cycle.cycleId);
    expect(ids).toContain("2026-04-25");
    expect(ids).not.toContain("2026-04-24");

    const paidBill = history!.find((item) => item.cycle.cycleId === "2026-04-25")!;
    expect(paidBill.cycle.dueDate).toBe("2026-05-24");
    expect(paidBill.settlement.amountDueTotal).toBe(3844.33);
    expect(paidBill.settlement.paidTotal).toBe(3844.33);
    expect(paidBill.status).toBe("paid");
  });

  it("lists only persisted invoices plus at most one open fallback", () => {
    const history = buildCardStatementHistory({
      cardAccount: {
        ...CARD,
        statement_due_day: 3,
      },
      referenceDate: "2026-07-21",
      transactions: [
        tx({
          id: "e-may",
          type: "expense",
          amount: 100,
          date: "2026-05-10",
        }),
        tx({
          id: "e-july",
          type: "expense",
          amount: 50,
          date: "2026-07-10",
        }),
        tx({
          id: "pay",
          type: "income",
          amount: 3844.33,
          date: "2026-04-24",
          statementCycleId: "2026-04-25",
          invoicePaymentOrigin: "imported",
        }),
      ],
      importedCycles: [
        {
          id: "apr",
          accountId: CARD.id,
          ownerUserId: "user-1",
          familyId: null,
          closingDate: "2026-04-25",
          periodStart: "2026-03-26",
          periodEnd: "2026-04-25",
          dueDate: "2026-05-04",
          amountDue: null,
          source: "imported",
          importBatchId: "batch-1",
          notes: null,
        },
      ],
    });

    const ids = history!.map((item) => item.cycle.cycleId);
    // May activity must not invent a synthetic invoice when imports exist.
    expect(ids).not.toContain("2026-05-25");
    expect(ids).toContain("2026-04-25");
    // Open July accumulating period is the single derived fallback.
    expect(ids).toContain("2026-07-25");

    const apr = history!.find((item) => item.cycle.cycleId === "2026-04-25")!;
    expect(apr.cycle.dueDate).toBe("2026-05-04");
    expect(apr.usesImportedCycle).toBe(true);
    expect(apr.settlement.amountDueTotal).toBe(3844.33);
  });

  it("attributes due-linked payments and coexists with legacy closing links", () => {
    const history = buildCardStatementHistory({
      cardAccount: {
        ...CARD,
        statement_due_day: 4,
      },
      referenceDate: "2026-05-10",
      transactions: [
        tx({
          id: "e1",
          type: "expense",
          amount: 500,
          date: "2026-04-10",
        }),
        tx({
          id: "pay-due",
          type: "income",
          amount: 3844.33,
          date: "2026-05-01",
          statementCycleId: null,
          statementDueDate: "2026-05-04",
          invoicePaymentOrigin: "imported",
        }),
        tx({
          id: "pay-legacy",
          type: "income",
          amount: 100,
          date: "2026-06-01",
          statementCycleId: "2026-05-25",
          statementDueDate: null,
          invoicePaymentOrigin: "imported",
        }),
        tx({
          id: "e2",
          type: "expense",
          amount: 80,
          date: "2026-05-10",
        }),
      ],
      importedCycles: [
        {
          id: "apr",
          accountId: CARD.id,
          ownerUserId: "user-1",
          familyId: null,
          closingDate: "2026-04-25",
          periodStart: "2026-03-26",
          periodEnd: "2026-04-25",
          dueDate: "2026-05-04",
          amountDue: 3844.33,
          source: "imported",
          importBatchId: "batch-1",
          notes: null,
        },
        {
          id: "may",
          accountId: CARD.id,
          ownerUserId: "user-1",
          familyId: null,
          closingDate: "2026-05-25",
          periodStart: "2026-04-26",
          periodEnd: "2026-05-25",
          dueDate: "2026-06-04",
          amountDue: null,
          source: "imported",
          importBatchId: "batch-2",
          notes: null,
        },
      ],
    });

    const apr = history!.find((item) => item.cycle.cycleId === "2026-04-25")!;
    const may = history!.find((item) => item.cycle.cycleId === "2026-05-25")!;

    expect(apr.cycle.dueDate).toBe("2026-05-04");
    expect(apr.settlement.paidTotal).toBe(3844.33);
    expect(apr.settlement.amountDueTotal).toBe(3844.33);
    expect(apr.status).toBe("paid");

    expect(may.settlement.paidTotal).toBe(100);
    expect(may.settlement.amountDueTotal).toBe(100);
    expect(may.status).toBe("paid");
  });

  it("for imported bills without issuer total, includes virada in the purchase fallback", () => {
    const history = buildCardStatementHistory({
      cardAccount: CARD,
      referenceDate: "2026-08-10",
      transactions: [
        tx({
          id: "virada",
          type: "expense",
          amount: 863.48,
          date: "2026-04-25",
        }),
        tx({
          id: "may",
          type: "expense",
          amount: 3790.98,
          date: "2026-05-10",
        }),
      ],
      importedCycles: [
        {
          id: "may-imp",
          accountId: CARD.id,
          ownerUserId: "user-1",
          familyId: null,
          closingDate: "2026-05-25",
          periodStart: "2026-04-26",
          periodEnd: "2026-05-25",
          dueDate: "2026-06-01",
          amountDue: null,
          source: "imported",
          importBatchId: "batch-1",
          notes: null,
        },
      ],
    });

    const may = history!.find((item) => item.cycle.cycleId === "2026-05-25")!;
    expect(may.settlement.cyclePurchasesTotal).toBe(3790.98);
    expect(may.settlement.rolledInPurchasesTotal).toBe(863.48);
    expect(may.settlement.amountDueTotal).toBe(4654.46);
    expect(may.settlement.remainingTotal).toBe(4654.46);
  });

  it("prefers issuer amount_due on imported bills even when purchases differ", () => {
    const history = buildCardStatementHistory({
      cardAccount: CARD,
      referenceDate: "2026-08-10",
      transactions: [
        tx({
          id: "may",
          type: "expense",
          amount: 3790.98,
          date: "2026-05-10",
        }),
      ],
      importedCycles: [
        {
          id: "may-imp",
          accountId: CARD.id,
          ownerUserId: "user-1",
          familyId: null,
          closingDate: "2026-05-25",
          periodStart: "2026-04-26",
          periodEnd: "2026-05-25",
          dueDate: "2026-06-01",
          amountDue: 4654.46,
          source: "imported",
          importBatchId: "batch-1",
          notes: null,
        },
      ],
    });

    const may = history!.find((item) => item.cycle.cycleId === "2026-05-25")!;
    expect(may.settlement.amountDueTotal).toBe(4654.46);
    expect(may.settlement.issuerPurchaseGap).toBe(863.48);
  });

  it("works with persisted invoices even when account days are unset", () => {
    const history = buildCardStatementHistory({
      cardAccount: {
        ...CARD,
        statement_closing_day: null,
        statement_due_day: null,
      },
      referenceDate: "2026-07-21",
      transactions: [
        tx({
          id: "pay",
          type: "income",
          amount: 1000,
          date: "2026-05-04",
          statementCycleId: "2026-04-25",
          invoicePaymentOrigin: "imported",
        }),
      ],
      importedCycles: [
        {
          id: "apr",
          accountId: CARD.id,
          ownerUserId: "user-1",
          familyId: null,
          closingDate: "2026-04-25",
          periodStart: "2026-03-26",
          periodEnd: "2026-04-25",
          dueDate: "2026-05-04",
          amountDue: 1000,
          source: "imported",
          importBatchId: "batch-1",
          notes: null,
        },
      ],
    });

    expect(history).toHaveLength(1);
    expect(history![0]?.cycle.dueDate).toBe("2026-05-04");
    expect(history![0]?.settlement.amountDueTotal).toBe(1000);
    expect(history![0]?.settlement.paidTotal).toBe(1000);
  });

  it("marks open / partial / paid / overdue correctly", () => {
    const open = buildCardStatementHistory({
      cardAccount: CARD,
      referenceDate: "2026-07-20",
      transactions: [
        tx({ id: "e", type: "expense", amount: 50, date: "2026-07-10" }),
      ],
    })!.find((item) => item.isCurrent)!;

    expect(open.status).toBe("open");

    const partial = buildCardStatementHistoryDetail({
      cardAccount: CARD,
      cycleId: CYCLE_JUL,
      referenceDate: "2026-08-02",
      transactions: [
        tx({ id: "e", type: "expense", amount: 100, date: "2026-07-10" }),
        tx({
          id: "p",
          type: "income",
          amount: 40,
          date: "2026-08-01",
          statementCycleId: CYCLE_JUL,
          invoicePaymentOrigin: "manual",
        }),
      ],
    })!;

    expect(partial.status).toBe("partial");
    expect(partial.settlement.remainingTotal).toBe(60);
  });
});

describe("listStatementCyclePayments", () => {
  const config = {
    statementClosingDay: 25,
    statementDueDay: 1,
  };

  const cycle = {
    cycleId: CYCLE_JUL,
    periodStart: "2026-06-26",
    periodEnd: CYCLE_JUL,
    closingDate: CYCLE_JUL,
    dueDate: "2026-08-01",
  };

  it("shows manual pending and imported direct payments", () => {
    const payments = listStatementCyclePayments({
      cardAccountId: CARD.id,
      config,
      cycle,
      cardTransactions: [
        tx({
          id: "manual-1",
          type: "income",
          amount: 30,
          date: "2026-07-28",
          statementCycleId: CYCLE_JUL,
          invoicePaymentOrigin: "manual",
          linkedTransactionId: "src-m",
        }),
        tx({
          id: "imported-1",
          type: "income",
          amount: 70,
          date: "2026-08-01",
          statementCycleId: CYCLE_JUL,
          invoicePaymentOrigin: "imported",
          linkedTransactionId: "src-i",
        }),
      ],
      sourcesByTransactionId: new Map([
        ["src-m", { accountId: "chk-1", accountName: "Nubank Conta" }],
        ["src-i", { accountId: "chk-1", accountName: "Nubank Conta" }],
      ]),
    });

    expect(payments).toHaveLength(2);
    expect(payments.map((payment) => payment.displayStatus).sort()).toEqual([
      "imported",
      "manual_pending",
    ]);
    expect(payments.every((payment) => payment.sourceAccountName === "Nubank Conta")).toBe(
      true,
    );
  });

  it("collapses reconciled manual+imported into a single visual row", () => {
    const payments = listStatementCyclePayments({
      cardAccountId: CARD.id,
      config,
      cycle,
      cardTransactions: [
        tx({
          id: "manual-1",
          type: "income",
          amount: 100,
          date: "2026-07-28",
          statementCycleId: CYCLE_JUL,
          invoicePaymentOrigin: "manual",
          reconciledWithTransactionId: "imported-1",
        }),
        tx({
          id: "imported-1",
          type: "income",
          amount: 100,
          date: "2026-08-01",
          statementCycleId: CYCLE_JUL,
          invoicePaymentOrigin: "imported",
          reconciledWithTransactionId: "manual-1",
          linkedTransactionId: "src-i",
        }),
      ],
      sourcesByTransactionId: new Map([
        ["src-i", { accountId: "chk-1", accountName: "Conta" }],
      ]),
    });

    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      id: "imported-1",
      displayStatus: "reconciled",
      pairedTransactionId: "manual-1",
      pairedOrigin: "manual",
      amount: 100,
    });
  });
});

describe("buildCardStatementHistoryDetail", () => {
  it("returns settlement fields and payment list for a cycle", () => {
    const detail = buildCardStatementHistoryDetail({
      cardAccount: CARD,
      cycleId: CYCLE_JUL,
      referenceDate: "2026-08-05",
      transactions: [
        tx({ id: "e", type: "expense", amount: 150, date: "2026-07-05" }),
        tx({
          id: "p",
          type: "income",
          amount: 150,
          date: "2026-08-01",
          statementCycleId: CYCLE_JUL,
          invoicePaymentOrigin: "imported",
          description: "Pagamento recebido — pix",
        }),
      ],
    });

    expect(detail).toMatchObject({
      cardAccountName: "Nubank Cartão",
      periodLabel: "26/06–25/07",
      status: "paid",
    });
    expect(detail!.settlement.cyclePurchasesTotal).toBe(150);
    expect(detail!.settlement.amountDueTotal).toBe(150);
    expect(detail!.payments).toHaveLength(1);
    expect(detail!.payments[0]?.notes).toBe("pix");
    expect(detail!.composition).toMatchObject({
      cyclePurchasesTotal: 150,
      rolledInPurchasesTotal: 0,
      amountDueTotal: 150,
      isCycleOnly: true,
    });
  });

  it("includes rolled-in composition only on the current open cycle", () => {
    // With closing day 25, on 2026-07-20 the open cycle closes 2026-07-25.
    const detail = buildCardStatementHistoryDetail({
      cardAccount: CARD,
      cycleId: CYCLE_JUL,
      referenceDate: "2026-07-20",
      transactions: [
        tx({
          id: "cycle-e",
          type: "expense",
          amount: 100,
          date: "2026-07-10",
          description: "Mercado",
        }),
        tx({
          id: "roll-e",
          type: "expense",
          amount: 40,
          date: "2026-06-25",
          description: "Parcela 2/6",
        }),
      ],
    });

    expect(detail!.isCurrent).toBe(true);
    expect(detail!.composition).toMatchObject({
      cyclePurchasesTotal: 100,
      rolledInPurchasesTotal: 40,
      amountDueTotal: 140,
      hasRolledIn: true,
      isCycleOnly: false,
    });
    expect(detail!.composition?.cycleLines.map((line) => line.id)).toEqual([
      "cycle-e",
    ]);
    expect(detail!.composition?.rolledInLines.map((line) => line.id)).toEqual([
      "roll-e",
    ]);
  });
});

describe("helpers", () => {
  it("builds faturas href and extracts notes", () => {
    expect(buildFaturasHref({ accountId: "card-1" })).toBe(
      "/faturas?account=card-1",
    );
    expect(
      buildFaturasHref({ accountId: "card-1", cycleId: CYCLE_JUL }),
    ).toBe(`/faturas?account=card-1&cycle=${CYCLE_JUL}`);
    expect(
      buildFaturasHref({
        accountId: "card-1",
        status: "overdue",
      }),
    ).toBe("/faturas?account=card-1&status=overdue");
    expect(
      buildFaturasHref({
        accountId: "card-1",
        status: "all",
      }),
    ).toBe("/faturas?account=card-1");
    expect(extractInvoicePaymentNotes("Pagamento recebido — pix")).toBe("pix");
    expect(extractInvoicePaymentNotes("Pagamento recebido", "obs")).toBe("obs");
  });
});

describe("filterCardStatementHistory", () => {
  function sampleHistory() {
    return buildCardStatementHistory({
      cardAccount: CARD,
      referenceDate: "2026-08-10",
      transactions: [
        // July: paid
        tx({ id: "e-jul", type: "expense", amount: 200, date: "2026-07-10" }),
        tx({
          id: "p-jul",
          type: "income",
          amount: 200,
          date: "2026-08-01",
          statementCycleId: CYCLE_JUL,
          invoicePaymentOrigin: "imported",
        }),
        // June: overdue unpaid
        tx({ id: "e-jun", type: "expense", amount: 80, date: "2026-06-10" }),
        // Current open cycle (Aug close 25): expense in period, unpaid, not due yet
        tx({ id: "e-cur", type: "expense", amount: 50, date: "2026-08-05" }),
      ],
    })!;
  }

  it("keeps all items for Todas", () => {
    const history = sampleHistory();
    expect(filterCardStatementHistory(history, "all")).toHaveLength(
      history.length,
    );
  });

  it("filters Atual to the current cycle only", () => {
    const history = sampleHistory();
    const filtered = filterCardStatementHistory(history, "current");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.isCurrent).toBe(true);
  });

  it("filters Aberta / Parcial / Paga / Atrasada by domain status", () => {
    const history = sampleHistory();

    expect(
      filterCardStatementHistory(history, "paid").every(
        (item) => item.status === "paid",
      ),
    ).toBe(true);
    expect(filterCardStatementHistory(history, "paid").length).toBeGreaterThan(
      0,
    );

    expect(
      filterCardStatementHistory(history, "overdue").every(
        (item) => item.status === "overdue",
      ),
    ).toBe(true);
    expect(
      filterCardStatementHistory(history, "overdue").length,
    ).toBeGreaterThan(0);

    expect(
      filterCardStatementHistory(history, "open").every(
        (item) => item.status === "open",
      ),
    ).toBe(true);

    const withPartial = [
      ...history,
      {
        ...history[0]!,
        cycle: { ...history[0]!.cycle, cycleId: "2026-05-25" },
        status: "partial" as const,
        statusLabel: "Parcial",
        isCurrent: false,
        settlement: {
          ...history[0]!.settlement,
          status: "partial" as const,
          paidTotal: 10,
          remainingTotal: 90,
        },
      },
    ];

    expect(filterCardStatementHistory(withPartial, "partial")).toHaveLength(1);
    expect(filterCardStatementHistory(withPartial, "partial")[0]?.status).toBe(
      "partial",
    );
  });

  it("returns empty arrays safely and empty-state messages", () => {
    expect(filterCardStatementHistory([], "overdue")).toEqual([]);
    expect(
      getFaturasListEmptyMessage({
        filter: "overdue",
        hasAnyStatements: true,
      }),
    ).toMatch(/atrasada/i);
    expect(
      getFaturasListEmptyMessage({
        filter: "all",
        hasAnyStatements: false,
      }),
    ).toMatch(/ainda não há ciclos/i);
  });

  it("parses status query values with safe fallback", () => {
    expect(parseFaturasListFilter(null)).toBe("all");
    expect(parseFaturasListFilter("current")).toBe("current");
    expect(parseFaturasListFilter("OPEN")).toBe("open");
    expect(parseFaturasListFilter("nope")).toBe("all");
  });
});
