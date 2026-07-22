import { describe, expect, it } from "vitest";

import {
  assessImportBatchRollbackImpact,
  buildImportBatchRollbackConfirmCopy,
} from "./rollback-import-batch";

describe("assessImportBatchRollbackImpact", () => {
  it("counts launches, invoice payments and cycles", () => {
    const impact = assessImportBatchRollbackImpact({
      batchId: "b1",
      fileName: "Nubank.csv",
      accountId: "acc-1",
      status: "committed",
      importedCycleCount: 2,
      rows: [
        {
          id: "r1",
          batch_id: "b1",
          kind: "card_purchase",
          row_date: "2026-07-01",
          amount: 50,
          description: "Loja",
          transaction_id: "t1",
          linked_transaction_id: null,
        },
        {
          id: "r2",
          batch_id: "b1",
          kind: "card_invoice_payment",
          row_date: "2026-07-26",
          amount: 100,
          description: "Pagamento recebido",
          transaction_id: "t2",
          linked_transaction_id: "t3",
        },
      ],
      transactions: [
        {
          id: "t1",
          amount: 50,
          transaction_date: "2026-07-01",
          description: "Loja",
          type: "expense",
          reconciled_with_transaction_id: null,
          linked_transaction_id: null,
        },
        {
          id: "t2",
          amount: 100,
          transaction_date: "2026-07-26",
          description: "Pagamento recebido",
          type: "income",
          reconciled_with_transaction_id: null,
          linked_transaction_id: "t3",
        },
        {
          id: "t3",
          amount: 100,
          transaction_date: "2026-07-26",
          description: "Pagamento fatura",
          type: "expense",
          reconciled_with_transaction_id: null,
          linked_transaction_id: "t2",
        },
      ],
    });

    expect(impact.transactionCount).toBe(3);
    expect(impact.invoicePaymentCount).toBe(1);
    expect(impact.importedCycleCount).toBe(2);
    expect(impact.canRollback).toBe(true);
    expect(impact.blockers).toEqual([]);
  });

  it("warns on edited amounts and blocks external links", () => {
    const impact = assessImportBatchRollbackImpact({
      batchId: "b1",
      fileName: null,
      accountId: "acc-1",
      status: "committed",
      importedCycleCount: 0,
      rows: [
        {
          id: "r1",
          batch_id: "b1",
          kind: "bank_expense",
          row_date: "2026-07-01",
          amount: 50,
          description: "Mercado",
          transaction_id: "t1",
          linked_transaction_id: null,
        },
      ],
      transactions: [
        {
          id: "t1",
          amount: 80,
          transaction_date: "2026-07-01",
          description: "Mercado",
          type: "expense",
          reconciled_with_transaction_id: "manual-1",
          linked_transaction_id: "outside-1",
        },
      ],
    });

    expect(impact.editedTransactionCount).toBe(1);
    expect(impact.reconciledManualCount).toBe(1);
    expect(impact.canRollback).toBe(false);
    expect(impact.blockers[0]).toMatch(/vinculados fora deste lote/i);
    expect(impact.warnings.some((w) => /editados/i.test(w))).toBe(true);
  });
});

describe("buildImportBatchRollbackConfirmCopy", () => {
  it("summarizes impact for the confirm dialog", () => {
    const copy = buildImportBatchRollbackConfirmCopy({
      batchId: "b1",
      fileName: "file.csv",
      accountId: "a1",
      status: "committed",
      transactionCount: 5,
      createdItemCount: 4,
      invoicePaymentCount: 1,
      importedCycleCount: 2,
      editedTransactionCount: 0,
      reconciledManualCount: 0,
      warnings: [],
      blockers: [],
      canRollback: true,
    });

    expect(copy.title).toBe("Excluir importação");
    expect(copy.description).toMatch(/5 lançamento/);
    expect(copy.description).toMatch(/pagamento/);
    expect(copy.description).toMatch(/ciclo/);
    expect(copy.confirmLabel).toBe("Excluir importação");
  });
});
