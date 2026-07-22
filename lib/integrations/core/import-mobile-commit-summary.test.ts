import { describe, expect, it } from "vitest";

import { formatImportMobileCommitSummary } from "@/lib/integrations/core/import-mobile-commit-summary";

describe("formatImportMobileCommitSummary", () => {
  it("formats rows without payments", () => {
    expect(
      formatImportMobileCommitSummary({ totalRows: 1, paymentCount: 0 }),
    ).toBe("1 lançamento");
    expect(
      formatImportMobileCommitSummary({ totalRows: 55, paymentCount: 0 }),
    ).toBe("55 lançamentos");
  });

  it("includes invoice payment count", () => {
    expect(
      formatImportMobileCommitSummary({ totalRows: 55, paymentCount: 1 }),
    ).toBe("55 lançamentos · 1 pagamento de fatura");
    expect(
      formatImportMobileCommitSummary({ totalRows: 55, paymentCount: 2 }),
    ).toBe("55 lançamentos · 2 pagamentos de fatura");
  });
});
