import { describe, expect, it } from "vitest";

import { getNavItemByPath, getPageMeta } from "@/components/layout/nav-items";
import {
  IMPORTACOES_ROUTES,
  IMPORTATION_SECTION_LABELS,
  buildGuidedReimportHref,
  buildImportationDetailSections,
  buildImportationTitle,
  getGuidedReimportIntro,
  getImportationRowKindLabel,
  getImportationRowResultLabel,
  getImportationsEmptyMessage,
  importBatchStatusLabels,
  mapImportationListItem,
  parseGuidedReimportSearchParams,
  summarizeImportBatchRows,
  type ImportationDetailRow,
} from "./importations";

describe("IMPORTACOES_ROUTES", () => {
  it("exposes list, nova importação, and detail paths", () => {
    expect(IMPORTACOES_ROUTES.list).toBe("/importacoes");
    expect(IMPORTACOES_ROUTES.nova).toBe("/importacoes/nova");
    expect(IMPORTACOES_ROUTES.detail("batch-1")).toBe("/importacoes/batch-1");
  });

  it("keeps Importações as the nav entry for the area", () => {
    expect(getNavItemByPath(IMPORTACOES_ROUTES.list)?.label).toBe("Importações");
    expect(getNavItemByPath(IMPORTACOES_ROUTES.nova)?.label).toBe("Importações");
    expect(getNavItemByPath(IMPORTACOES_ROUTES.detail("x"))?.label).toBe(
      "Importações",
    );
    expect(getPageMeta(IMPORTACOES_ROUTES.nova).title).toBe("Importações");
  });
});

describe("buildImportationTitle / labels", () => {
  it("uses product language for sources and statuses", () => {
    expect(buildImportationTitle("nubank_credit_card")).toBe(
      "Importação do Nubank (cartão)",
    );
    expect(buildImportationTitle("nubank_checking")).toBe(
      "Importação do Nubank (conta)",
    );
    expect(importBatchStatusLabels.committed).toBe("Concluída");
    expect(importBatchStatusLabels.failed).toBe("Falhou");
    expect(getImportationRowKindLabel("card_invoice_payment")).toBe(
      "Pagamento de fatura",
    );
    expect(getImportationRowKindLabel("card_purchase")).toBe("Compra no cartão");
    expect(getImportationsEmptyMessage()).toMatch(/csv do nubank/i);
  });
});

describe("summarizeImportBatchRows", () => {
  it("counts created launches, ignored items and invoice payments", () => {
    const summary = summarizeImportBatchRows([
      {
        id: "r1",
        batch_id: "b1",
        source_line: 1,
        kind: "card_purchase",
        row_date: "2026-07-01",
        amount: 10,
        direction: "out",
        description: "Loja",
        transaction_id: "t1",
        linked_transaction_id: null,
      },
      {
        id: "r2",
        batch_id: "b1",
        source_line: 2,
        kind: "card_invoice_payment",
        row_date: "2026-07-26",
        amount: 100,
        direction: "in",
        description: "Pagamento recebido",
        transaction_id: "t2",
        linked_transaction_id: "t3",
      },
      {
        id: "r3",
        batch_id: "b1",
        source_line: 3,
        kind: "card_purchase",
        row_date: "2026-07-02",
        amount: 5,
        direction: "out",
        description: "Café",
        transaction_id: null,
        linked_transaction_id: null,
      },
    ]);

    expect(summary.createdLaunchCount).toBe(3); // t1 + t2 + t3
    expect(summary.createdItemCount).toBe(2);
    expect(summary.invoicePaymentCount).toBe(1);
    expect(summary.ignoredItemCount).toBe(1);
  });
});

describe("mapImportationListItem", () => {
  it("builds list href and display fields for history", () => {
    const item = mapImportationListItem({
      batch: {
        id: "batch-1",
        source: "nubank_checking",
        fileName: "nu.csv",
        accountId: "acc-1",
        status: "committed",
        rowCount: 12,
        importedAt: "2026-07-20T12:00:00.000Z",
      },
      accountName: "Nubank Conta",
      createdLaunchCount: 10,
      invoicePaymentCount: 0,
    });

    expect(item).toMatchObject({
      title: "Importação do Nubank (conta)",
      sourceLabel: "Nubank — Conta corrente",
      statusLabel: "Concluída",
      accountName: "Nubank Conta",
      fileName: "nu.csv",
      href: "/importacoes/batch-1",
      createdLaunchCount: 10,
      rowCount: 12,
    });
  });

  it("exposes invoice payment counts when present", () => {
    const item = mapImportationListItem({
      batch: {
        id: "batch-2",
        source: "nubank_credit_card",
        fileName: "card.csv",
        accountId: "card-1",
        status: "committed",
        rowCount: 5,
        importedAt: "2026-07-19T10:00:00.000Z",
      },
      accountName: "Nubank Cartão",
      createdLaunchCount: 6,
      invoicePaymentCount: 1,
    });

    expect(item.title).toBe("Importação do Nubank (cartão)");
    expect(item.invoicePaymentCount).toBe(1);
    expect(item.href).toBe(IMPORTACOES_ROUTES.detail("batch-2"));
  });
});

function detailRow(
  partial: Partial<ImportationDetailRow> &
    Pick<ImportationDetailRow, "id" | "description" | "createdLaunch" | "isInvoicePayment">,
): ImportationDetailRow {
  return {
    sourceLine: 1,
    kind: partial.isInvoicePayment ? "card_invoice_payment" : "card_purchase",
    kindLabel: partial.isInvoicePayment
      ? "Pagamento de fatura"
      : "Compra no cartão",
    rowDate: "2026-07-10",
    amount: 20,
    direction: "out",
    resultLabel: getImportationRowResultLabel(partial),
    ...partial,
  };
}

describe("buildImportationDetailSections", () => {
  it("groups created, ignored and invoice payment rows with product labels", () => {
    const sections = buildImportationDetailSections([
      detailRow({
        id: "c1",
        description: "Mercado",
        createdLaunch: true,
        isInvoicePayment: false,
      }),
      detailRow({
        id: "i1",
        description: "Pagamento recebido",
        createdLaunch: true,
        isInvoicePayment: true,
        direction: "in",
        amount: 100,
      }),
      detailRow({
        id: "g1",
        description: "Duplicata",
        createdLaunch: false,
        isInvoicePayment: false,
      }),
    ]);

    expect(sections.map((section) => section.id)).toEqual([
      "created",
      "invoice_payments",
      "ignored",
    ]);
    expect(sections[0]?.label).toBe(IMPORTATION_SECTION_LABELS.created);
    expect(sections[0]?.rows.map((row) => row.id)).toEqual(["c1"]);
    expect(sections[1]?.label).toBe(
      IMPORTATION_SECTION_LABELS.invoice_payments,
    );
    expect(sections[1]?.rows.map((row) => row.id)).toEqual(["i1"]);
    expect(sections[2]?.label).toBe(IMPORTATION_SECTION_LABELS.ignored);
    expect(sections[2]?.rows.map((row) => row.id)).toEqual(["g1"]);
  });

  it("omits empty sections", () => {
    const sections = buildImportationDetailSections([
      detailRow({
        id: "c1",
        description: "Só criada",
        createdLaunch: true,
        isInvoicePayment: false,
      }),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe("created");
  });
});

describe("guided reimport", () => {
  it("builds Importar novamente href with account and source context", () => {
    expect(
      buildGuidedReimportHref({
        batchId: "batch-9",
        accountId: "card-1",
        source: "nubank_credit_card",
      }),
    ).toBe(
      "/importacoes/nova?from=batch-9&account=card-1&source=nubank_credit_card",
    );
  });

  it("parses guided reimport search params", () => {
    const params = new URLSearchParams(
      "from=batch-9&account=card-1&source=nubank_credit_card",
    );
    expect(parseGuidedReimportSearchParams(params)).toEqual({
      fromBatchId: "batch-9",
      accountId: "card-1",
      source: "nubank_credit_card",
    });
  });

  it("ignores invalid source values", () => {
    const params = new URLSearchParams("from=b1&account=a1&source=other");
    expect(parseGuidedReimportSearchParams(params).source).toBeNull();
  });

  it("uses product language for the guided intro", () => {
    expect(
      getGuidedReimportIntro({
        source: "nubank_credit_card",
        accountName: "Cartão Nubank",
      }),
    ).toMatch(/importando novamente/i);
    expect(
      getGuidedReimportIntro({
        source: "nubank_credit_card",
        accountName: "Cartão Nubank",
      }),
    ).toMatch(/Cartão Nubank/);
    expect(
      getGuidedReimportIntro({
        source: "nubank_credit_card",
        accountName: "Cartão Nubank",
      }),
    ).not.toMatch(/batch|rpc|commit/i);
  });
});

describe("getImportationRowResultLabel", () => {
  it("labels invoice payments and ignored rows in product language", () => {
    expect(
      getImportationRowResultLabel({
        createdLaunch: true,
        isInvoicePayment: true,
      }),
    ).toBe("Pagamento de fatura reconhecido");
    expect(
      getImportationRowResultLabel({
        createdLaunch: false,
        isInvoicePayment: false,
      }),
    ).toBe("Item ignorado");
  });
});
