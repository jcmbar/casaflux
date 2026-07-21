import { describe, expect, it } from "vitest";

import { buildImportPreview } from "../core/import-orchestrator";
import { enrichImportPreviewWithHistory } from "../history/compare-preview-with-history";
import { hashImportContent } from "../history/hash-content";
import { InMemoryImportHistoryStore } from "../history/in-memory-store";
import { buildRegisterInputFromPreview } from "../history/import-history-service";
import { buildImportRowIdentityKey } from "../history/row-identity";
import {
  buildCommitImportRpcPayload,
  getCommitImportPreviewValidationError,
} from "./commit-import-preview";
import {
  buildCommitImportRowPayload,
  getCommittableImportRows,
  mapImportRowToTransactions,
} from "./map-import-row";
import { applyConfirmedCategoryToRow } from "../categories/category-suggestion-service";

const CARD_ACCOUNT_ID = "card-account-1";
const CHECKING_ACCOUNT_ID = "checking-account-1";
const SOURCE_CHECKING_ID = "checking-source-1";

describe("mapImportRowToTransactions", () => {
  it("maps checking income and expense rows", () => {
    const preview = buildImportPreview({
      content: [
        "Data,Valor,Identificador,Descrição",
        "01/07/2026,100.00,id-1,Transferência Recebida - Foo",
        "03/07/2026,-1.50,id-2,Compra no débito - Bar",
      ].join("\n"),
    });

    const income = preview.rows[0]!;
    const expense = preview.rows[1]!;

    expect(mapImportRowToTransactions(income, CHECKING_ACCOUNT_ID)[0]).toMatchObject({
      accountId: CHECKING_ACCOUNT_ID,
      type: "income",
      amount: 100,
    });
    expect(mapImportRowToTransactions(expense, CHECKING_ACCOUNT_ID)[0]).toMatchObject({
      accountId: CHECKING_ACCOUNT_ID,
      type: "expense",
      amount: 1.5,
    });
  });

  it("maps card invoice payment as linked checking expense and card income", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-06-26,Pagamento recebido,"- 3.598,45"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const paymentRow = preview.rows[0]!;
    const transactions = mapImportRowToTransactions(
      paymentRow,
      CARD_ACCOUNT_ID,
      SOURCE_CHECKING_ID,
      { statementClosingDay: 20, statementDueDay: 27 },
    );

    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      accountId: SOURCE_CHECKING_ID,
      type: "expense",
      amount: 3598.45,
      statementCycleId: "2026-06-20",
    });
    expect(transactions[1]).toMatchObject({
      accountId: CARD_ACCOUNT_ID,
      type: "income",
      amount: 3598.45,
      statementCycleId: "2026-06-20",
    });
  });

  it("leaves statementCycleId null when card billing is not configured", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-06-26,Pagamento recebido,"- 100,00"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const transactions = mapImportRowToTransactions(
      preview.rows[0]!,
      CARD_ACCOUNT_ID,
      SOURCE_CHECKING_ID,
    );

    expect(transactions[0]?.statementCycleId ?? null).toBeNull();
    expect(transactions[1]?.statementCycleId ?? null).toBeNull();
  });
});

describe("commitImportPreview selection", () => {
  it("commits only new ready rows and requires invoice source account", () => {
    const cardPreview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-07-01,Store,"10,00"',
        '2026-06-26,Pagamento recebido,"- 100,00"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const withoutInvoiceSource = getCommittableImportRows(cardPreview.rows, {});
    expect(withoutInvoiceSource).toHaveLength(1);
    expect(withoutInvoiceSource[0]?.description).toBe("Store");

    const withInvoiceSource = getCommittableImportRows(cardPreview.rows, {
      3: SOURCE_CHECKING_ID,
    });
    expect(withInvoiceSource).toHaveLength(2);
  });

  it("excludes historically imported rows from commit payload", () => {
    const store = new InMemoryImportHistoryStore();
    const content = [
      "date,title,amount",
      '2026-07-01,Store,"10,00"',
      '2026-07-02,Other,"20,00"',
    ].join("\n");

    const firstPreview = buildImportPreview({
      content,
      cardAccountId: CARD_ACCOUNT_ID,
    });

    store.registerBatch(
      buildRegisterInputFromPreview({
        preview: firstPreview,
        ownerUserId: "user-1",
        familyId: null,
        accountId: CARD_ACCOUNT_ID,
        fileName: "partial.csv",
        contentHash: hashImportContent(content),
      })!,
    );

    const secondPreview = buildImportPreview({
      content,
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const history = store.fetchContext({
      ownerUserId: "user-1",
      accountId: CARD_ACCOUNT_ID,
      contentHash: hashImportContent(content),
      identityKeys: secondPreview.rows.map((row) =>
        buildImportRowIdentityKey(row, CARD_ACCOUNT_ID),
      ),
      externalIds: [],
    });

    const enriched = enrichImportPreviewWithHistory(
      secondPreview,
      history,
      CARD_ACCOUNT_ID,
    );

    const committable = getCommittableImportRows(enriched.rows, {});
    expect(committable).toHaveLength(0);

    const validationError = getCommitImportPreviewValidationError({
      preview: enriched,
      targetAccountId: CARD_ACCOUNT_ID,
      invoiceSourceAccounts: {},
      ownerUserId: "user-1",
      familyId: null,
      fileName: "partial.csv",
      contentHash: hashImportContent(content),
    });
    expect(validationError).toBe("Todas as linhas deste arquivo já haviam sido importadas.");
  });

  it("allows partial overlap when only some rows are new", () => {
    const store = new InMemoryImportHistoryStore();
    const content = [
      "date,title,amount",
      '2026-07-01,Store,"10,00"',
      '2026-07-02,Other,"20,00"',
    ].join("\n");

    const firstPreview = buildImportPreview({
      content,
      cardAccountId: CARD_ACCOUNT_ID,
    });

    store.registerBatch(
      buildRegisterInputFromPreview({
        preview: {
          ...firstPreview,
          rows: [firstPreview.rows[0]!],
        },
        ownerUserId: "user-1",
        familyId: null,
        accountId: CARD_ACCOUNT_ID,
        fileName: "partial.csv",
        contentHash: hashImportContent(content),
      })!,
    );

    const overlapPreview = buildImportPreview({
      content,
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const history = store.fetchContext({
      ownerUserId: "user-1",
      accountId: CARD_ACCOUNT_ID,
      contentHash: hashImportContent(content),
      identityKeys: overlapPreview.rows.map((row) =>
        buildImportRowIdentityKey(row, CARD_ACCOUNT_ID),
      ),
      externalIds: [],
    });

    const enriched = enrichImportPreviewWithHistory(
      overlapPreview,
      history,
      CARD_ACCOUNT_ID,
    );

    const committable = getCommittableImportRows(enriched.rows, {});
    expect(committable).toHaveLength(1);
    expect(committable[0]?.description).toBe("Other");

    const validationError = getCommitImportPreviewValidationError({
      preview: enriched,
      targetAccountId: CARD_ACCOUNT_ID,
      invoiceSourceAccounts: {},
      ownerUserId: "user-1",
      familyId: null,
      fileName: "partial.csv",
      contentHash: hashImportContent(content),
    });
    expect(validationError).toBeNull();
  });

  it("builds RPC payload only for committable rows", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-07-01,Store,"10,00"',
        '2026-07-01,Store,"10,00"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const payload = buildCommitImportRpcPayload({
      preview,
      targetAccountId: CARD_ACCOUNT_ID,
      invoiceSourceAccounts: {},
      ownerUserId: "user-1",
      familyId: null,
      fileName: "dup.csv",
      contentHash: hashImportContent("hash"),
    });

    expect(payload).toHaveLength(1);
    expect(payload[0]?.identity_key).toContain("store");
  });

  it("includes statement_cycle_id on invoice payment RPC payload when card is configured", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-07-26,Pagamento recebido,"- 100,00"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const payload = buildCommitImportRpcPayload({
      preview,
      targetAccountId: CARD_ACCOUNT_ID,
      invoiceSourceAccounts: {
        [preview.rows[0]!.sourceLine]: SOURCE_CHECKING_ID,
      },
      ownerUserId: "user-1",
      familyId: null,
      fileName: "card.csv",
      contentHash: hashImportContent("hash"),
      targetAccount: {
        type: "credit_card",
        statement_closing_day: 20,
        statement_due_day: 27,
      },
    });

    expect(payload).toHaveLength(1);
    expect(payload[0]?.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account_id: SOURCE_CHECKING_ID,
          type: "expense",
          statement_cycle_id: "2026-07-20",
          invoice_payment_origin: "imported",
        }),
        expect.objectContaining({
          account_id: CARD_ACCOUNT_ID,
          type: "income",
          statement_cycle_id: "2026-07-20",
          invoice_payment_origin: "imported",
        }),
      ]),
    );
  });

  it("includes confirmed category_id only for confirmed rows", () => {
    const preview = buildImportPreview({
      content: [
        "date,title,amount",
        '2026-07-01,Store,"10,00"',
      ].join("\n"),
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const row = preview.rows[0]!;
    const confirmedRow = applyConfirmedCategoryToRow(
      { ...row, historicalStatus: "new", categoryStatus: "suggested" },
      "cat-expense-1",
      [{ id: "cat-expense-1", name: "Compras", type: "expense" }],
    );

    const payload = buildCommitImportRowPayload(
      confirmedRow,
      CARD_ACCOUNT_ID,
      "identity-key",
      {},
    );

    expect(payload.transactions[0]?.categoryId).toBe("cat-expense-1");

    const unconfirmedPayload = buildCommitImportRowPayload(
      { ...row, historicalStatus: "new", categoryStatus: "none" },
      CARD_ACCOUNT_ID,
      "identity-key-2",
      {},
    );

    expect(unconfirmedPayload.transactions[0]?.categoryId).toBeUndefined();
  });
});
