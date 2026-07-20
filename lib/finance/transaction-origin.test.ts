import { describe, expect, it } from "vitest";

import {
  collectImportedTransactionIds,
  getTransactionOriginBadgeClass,
  getTransactionOriginBadgeProps,
  getTransactionOriginLabel,
  resolveTransactionOrigin,
  TRANSACTION_ORIGIN_LABELS,
} from "./transaction-origin";

describe("transaction origin", () => {
  it("defaults to Manual when not linked to an import row", () => {
    expect(resolveTransactionOrigin("tx-1", new Set())).toBe("manual");
    expect(getTransactionOriginLabel("manual")).toBe("Manual");
    expect(TRANSACTION_ORIGIN_LABELS.manual).toBe("Manual");
  });

  it("marks primary and linked import legs as Importado", () => {
    const imported = collectImportedTransactionIds([
      {
        transaction_id: "primary-1",
        linked_transaction_id: "linked-1",
      },
      {
        transaction_id: "solo-import",
        linked_transaction_id: null,
      },
    ]);

    expect([...imported].sort()).toEqual([
      "linked-1",
      "primary-1",
      "solo-import",
    ]);
    expect(resolveTransactionOrigin("primary-1", imported)).toBe("imported");
    expect(resolveTransactionOrigin("linked-1", imported)).toBe("imported");
    expect(resolveTransactionOrigin("manual-transfer", imported)).toBe(
      "manual",
    );
    expect(getTransactionOriginLabel("imported")).toBe("Importado");
  });

  it("keeps manual transfers as Manual regardless of type", () => {
    const imported = collectImportedTransactionIds([
      { transaction_id: "imported-expense", linked_transaction_id: null },
    ]);

    expect(resolveTransactionOrigin("transfer-out", imported)).toBe("manual");
    expect(resolveTransactionOrigin("transfer-in", imported)).toBe("manual");
  });

  it("uses discreet badge classes for both origins", () => {
    expect(getTransactionOriginBadgeClass("manual")).toMatch(/muted/);
    expect(getTransactionOriginBadgeClass("imported")).toMatch(/amber/);
  });

  it("exposes list badge props for Manual and Importado rows", () => {
    const imported = collectImportedTransactionIds([
      { transaction_id: "imported-1", linked_transaction_id: null },
    ]);

    expect(
      getTransactionOriginBadgeProps(
        resolveTransactionOrigin("manual-1", imported),
      ),
    ).toEqual({
      origin: "manual",
      label: "Manual",
      className: expect.stringMatching(/muted/),
    });

    expect(
      getTransactionOriginBadgeProps(
        resolveTransactionOrigin("imported-1", imported),
      ),
    ).toEqual({
      origin: "imported",
      label: "Importado",
      className: expect.stringMatching(/amber/),
    });

    expect(
      getTransactionOriginBadgeProps(
        resolveTransactionOrigin("manual-transfer", imported),
      ).label,
    ).toBe("Manual");
  });
});
