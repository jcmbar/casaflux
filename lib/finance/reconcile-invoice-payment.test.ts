import { describe, expect, it } from "vitest";

import { applyInvoicePaymentReconciliationsForBatch } from "@/lib/finance/reconcile-invoice-payment";

function createMockSupabase(input: {
  batchRows: Array<{
    source_line: number;
    transaction_id: string;
    linked_transaction_id: string;
  }>;
}) {
  const updates: Array<{ id: string; reconciled_with: string }> = [];

  const supabase = {
    from(table: string) {
      if (table === "import_batch_rows") {
        return {
          select() {
            return {
              eq() {
                return {
                  in() {
                    return Promise.resolve({
                      data: input.batchRows,
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "transactions") {
        return {
          update(payload: { reconciled_with_transaction_id: string }) {
            return {
              eq(_column: string, id: string) {
                updates.push({
                  id,
                  reconciled_with: payload.reconciled_with_transaction_id,
                });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, updates };
}

describe("applyInvoicePaymentReconciliationsForBatch", () => {
  it("links imported and manual card/source legs bidirectionally", async () => {
    const { supabase, updates } = createMockSupabase({
      batchRows: [
        {
          source_line: 3,
          transaction_id: "imported-source",
          linked_transaction_id: "imported-card",
        },
      ],
    });

    const result = await applyInvoicePaymentReconciliationsForBatch(
      supabase as never,
      {
        batchId: "batch-1",
        items: [
          {
            sourceLine: 3,
            manualCardTransactionId: "manual-card",
            manualSourceTransactionId: "manual-source",
          },
        ],
      },
    );

    expect(result).toEqual({ linked: 1, error: null });
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: "imported-card", reconciled_with: "manual-card" },
        { id: "manual-card", reconciled_with: "imported-card" },
        { id: "imported-source", reconciled_with: "manual-source" },
        { id: "manual-source", reconciled_with: "imported-source" },
      ]),
    );
    expect(updates).toHaveLength(4);
  });

  it("skips when batch has no matching rows", async () => {
    const { supabase, updates } = createMockSupabase({ batchRows: [] });

    const result = await applyInvoicePaymentReconciliationsForBatch(
      supabase as never,
      {
        batchId: "batch-1",
        items: [
          {
            sourceLine: 9,
            manualCardTransactionId: "manual-card",
          },
        ],
      },
    );

    expect(result.linked).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
