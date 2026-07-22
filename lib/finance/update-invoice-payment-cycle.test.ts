import { describe, expect, it, vi } from "vitest";

import {
  isInvoicePaymentCycleEditableRow,
  updateInvoicePaymentCycle,
} from "@/lib/finance/update-invoice-payment-cycle";

vi.mock("@/lib/finance/create-transaction", () => ({
  notifyTransactionsChanged: vi.fn(),
}));

function createMockSupabase(input: {
  primary: Record<string, unknown>;
  twin?: Record<string, unknown> | null;
  batchTwinId?: string | null;
}) {
  const updates: Array<{ ids: string[]; payload: Record<string, unknown> }> =
    [];
  const linkUpdates: Array<{ id: string; linked: string }> = [];

  const supabase = {
    from(table: string) {
      if (table === "transactions") {
        return {
          select() {
            return {
              eq(_column: string, id: string) {
                return {
                  maybeSingle() {
                    if (id === input.primary.id) {
                      return Promise.resolve({
                        data: input.primary,
                        error: null,
                      });
                    }
                    if (input.twin && id === input.twin.id) {
                      return Promise.resolve({
                        data: input.twin,
                        error: null,
                      });
                    }
                    return Promise.resolve({ data: null, error: null });
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            return {
              in(_column: string, ids: string[]) {
                updates.push({ ids, payload });
                return Promise.resolve({ error: null });
              },
              eq(_column: string, id: string) {
                if (typeof payload.linked_transaction_id === "string") {
                  linkUpdates.push({
                    id,
                    linked: payload.linked_transaction_id,
                  });
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (table === "import_batch_rows") {
        return {
          select() {
            return {
              or() {
                return {
                  limit() {
                    return {
                      maybeSingle() {
                        if (!input.batchTwinId) {
                          return Promise.resolve({
                            data: null,
                            error: null,
                          });
                        }
                        return Promise.resolve({
                          data: {
                            transaction_id: input.primary.id,
                            linked_transaction_id: input.batchTwinId,
                          },
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, updates, linkUpdates };
}

describe("updateInvoicePaymentCycle", () => {
  const billingConfig = {
    statementClosingDay: 25,
    statementDueDay: 3,
  };

  it("recognizes invoice payment rows for editing", () => {
    expect(
      isInvoicePaymentCycleEditableRow({
        description: "Pagamento recebido",
        invoice_payment_origin: "imported",
        type: "income",
      }),
    ).toBe(true);

    expect(
      isInvoicePaymentCycleEditableRow(
        {
          description: "Pagamento recebido",
          invoice_payment_origin: null,
          type: "income",
        },
        "credit_card",
      ),
    ).toBe(true);

    expect(
      isInvoicePaymentCycleEditableRow({
        description: "Mercado",
        invoice_payment_origin: null,
        type: "expense",
      }),
    ).toBe(false);
  });

  it("updates statement_cycle_id on primary and twin from linked_transaction_id", async () => {
    const { supabase, updates } = createMockSupabase({
      primary: {
        id: "card-leg",
        description: "Pagamento recebido",
        amount: 200,
        type: "income",
        account_id: "card-1",
        transaction_date: "2026-06-26",
        statement_cycle_id: "2026-06-25",
        invoice_payment_origin: "imported",
        linked_transaction_id: "source-leg",
        reconciled_with_transaction_id: null,
      },
      twin: {
        id: "source-leg",
        description: "Pagamento fatura (origem) — Pagamento recebido",
        amount: 200,
        type: "expense",
        account_id: "checking-1",
        transaction_date: "2026-06-26",
        statement_cycle_id: "2026-06-25",
        invoice_payment_origin: "imported",
        linked_transaction_id: "card-leg",
        reconciled_with_transaction_id: null,
      },
    });

    const result = await updateInvoicePaymentCycle(supabase as never, {
      transactionId: "card-leg",
      selection: { target: "current" },
      billingConfig,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.updatedIds).toEqual(["card-leg", "source-leg"]);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.ids).toEqual(["card-leg", "source-leg"]);
    expect(updates[0]?.payload.statement_cycle_id).toBe(result.statementCycleId);
    expect(updates[0]?.payload.statement_due_date).toBe(result.statementDueDate);
    expect(result.statementCycleId).not.toBe("2026-06-25");
    expect(result.statementDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("resolves twin via import_batch_rows when linked_transaction_id is missing", async () => {
    const { supabase, updates, linkUpdates } = createMockSupabase({
      primary: {
        id: "card-leg",
        description: "Pagamento recebido",
        amount: 150,
        type: "income",
        account_id: "card-1",
        transaction_date: "2026-06-26",
        statement_cycle_id: "2026-06-25",
        invoice_payment_origin: "imported",
        linked_transaction_id: null,
        reconciled_with_transaction_id: null,
      },
      twin: {
        id: "source-leg",
        description: "Pagamento fatura (origem) — Pagamento recebido",
        amount: 150,
        type: "expense",
        account_id: "checking-1",
        transaction_date: "2026-06-26",
        statement_cycle_id: "2026-06-25",
        invoice_payment_origin: "imported",
        linked_transaction_id: null,
        reconciled_with_transaction_id: null,
      },
      batchTwinId: "source-leg",
    });

    const result = await updateInvoicePaymentCycle(supabase as never, {
      transactionId: "card-leg",
      selection: { target: "previous" },
      billingConfig,
    });

    expect(result.ok).toBe(true);
    expect(updates[0]?.ids).toEqual(["card-leg", "source-leg"]);
    expect(linkUpdates).toEqual(
      expect.arrayContaining([
        { id: "card-leg", linked: "source-leg" },
        { id: "source-leg", linked: "card-leg" },
      ]),
    );
  });
});
