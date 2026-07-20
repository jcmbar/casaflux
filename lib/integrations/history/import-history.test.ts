import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach } from "vitest";

import { buildImportPreview } from "../core/import-orchestrator";
import {
  enrichImportPreviewWithHistory,
  withDefaultHistoricalRows,
} from "./compare-preview-with-history";
import { hashImportContent } from "./hash-content";
import { InMemoryImportHistoryStore } from "./in-memory-store";
import { buildRegisterInputFromPreview } from "./import-history-service";
import { buildImportRowIdentityKey } from "./row-identity";

const FIXTURES_DIR = path.join(
  process.cwd(),
  "lib/integrations/__fixtures__/nubank",
);

const CARD_FIXTURE = readFileSync(
  path.join(FIXTURES_DIR, "Nubank_2026-08-01.csv"),
  "utf8",
);

const CHECKING_FIXTURE = readFileSync(
  path.join(FIXTURES_DIR, "NU_74988370_01JUL2026_19JUL2026.csv"),
  "utf8",
);

const OWNER_ID = "user-1";
const CARD_ACCOUNT_ID = "card-account-1";
const CHECKING_ACCOUNT_ID = "checking-account-1";

describe("hashImportContent", () => {
  it("produces stable hashes for normalized content", () => {
    const hashA = hashImportContent("a,b\n1,2");
    const hashB = hashImportContent("a,b\r\n1,2");
    expect(hashA).toBe(hashB);
  });
});

describe("buildImportRowIdentityKey", () => {
  it("disambiguates checking reversal rows with the same Identificador", () => {
    const preview = buildImportPreview({ content: CHECKING_FIXTURE });
    const reversalUuid = "6a5cff73-490e-4f8e-8e67-953f71d273d1";
    const pairRows = preview.rows.filter((row) => row.externalId === reversalUuid);
    const keys = pairRows.map((row) =>
      buildImportRowIdentityKey(row, CHECKING_ACCOUNT_ID),
    );

    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });
});

describe("historical duplicate protection", () => {
  let store: InMemoryImportHistoryStore;

  beforeEach(() => {
    store = new InMemoryImportHistoryStore();
  });

  function registerPreview(params: {
    content: string;
    accountId: string;
    cardAccountId?: string;
    fileName?: string;
  }) {
    const preview = buildImportPreview({
      content: params.content,
      cardAccountId: params.cardAccountId,
    });
    const contentHash = hashImportContent(params.content);
    const input = buildRegisterInputFromPreview({
      preview,
      ownerUserId: OWNER_ID,
      familyId: null,
      accountId: params.accountId,
      fileName: params.fileName ?? "fixture.csv",
      contentHash,
    });

    if (!input) {
      throw new Error("Unable to build register input");
    }

    store.registerBatch(input);
    return { preview, contentHash };
  }

  it("detects the same file imported twice", () => {
    registerPreview({
      content: CARD_FIXTURE,
      accountId: CARD_ACCOUNT_ID,
      cardAccountId: CARD_ACCOUNT_ID,
      fileName: "Nubank_2026-08-01.csv",
    });

    const secondPreview = buildImportPreview({
      content: CARD_FIXTURE,
      cardAccountId: CARD_ACCOUNT_ID,
    });
    const contentHash = hashImportContent(CARD_FIXTURE);
    const identityKeys = secondPreview.rows.map((row) =>
      buildImportRowIdentityKey(row, CARD_ACCOUNT_ID),
    );
    const history = store.fetchContext({
      ownerUserId: OWNER_ID,
      accountId: CARD_ACCOUNT_ID,
      contentHash,
      identityKeys,
      externalIds: [],
    });

    const enriched = enrichImportPreviewWithHistory(
      secondPreview,
      history,
      CARD_ACCOUNT_ID,
    );

    expect(enriched.historicalSummary?.fileAlreadyImported).toBe(true);
    expect(enriched.warnings.some((warning) => warning.code === "file_already_imported")).toBe(
      true,
    );
    expect(enriched.summary.historicalAlreadyImportedRowCount).toBe(59);
    expect(enriched.summary.historicalNewRowCount).toBe(0);
    expect(enriched.rows.every((row) => row.historicalStatus === "already_imported")).toBe(
      true,
    );
  });

  it("detects repeated checking rows by Identificador", () => {
    registerPreview({
      content: CHECKING_FIXTURE,
      accountId: CHECKING_ACCOUNT_ID,
    });

    const secondPreview = buildImportPreview({ content: CHECKING_FIXTURE });
    const contentHash = hashImportContent(CHECKING_FIXTURE);
    const identityKeys = secondPreview.rows.map((row) =>
      buildImportRowIdentityKey(row, CHECKING_ACCOUNT_ID),
    );
    const externalIds = secondPreview.rows
      .map((row) => row.externalId)
      .filter(Boolean) as string[];

    const history = store.fetchContext({
      ownerUserId: OWNER_ID,
      accountId: CHECKING_ACCOUNT_ID,
      contentHash,
      identityKeys,
      externalIds,
    });

    const enriched = enrichImportPreviewWithHistory(
      secondPreview,
      history,
      CHECKING_ACCOUNT_ID,
    );

    expect(enriched.summary.historicalAlreadyImportedRowCount).toBe(24);
    expect(enriched.rows.every((row) => row.reviewStatus === "already_imported")).toBe(true);
  });

  it("detects repeated card rows by fingerprint", () => {
    const partialCard = [
      "date,title,amount",
      '2026-07-01,Test Store,"10,00"',
      '2026-07-02,Another Store,"20,00"',
    ].join("\n");

    registerPreview({
      content: partialCard,
      accountId: CARD_ACCOUNT_ID,
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const overlappingFile = [
      "date,title,amount",
      '2026-07-01,Test Store,"10,00"',
      '2026-07-03,Brand New Store,"30,00"',
    ].join("\n");

    const preview = buildImportPreview({
      content: overlappingFile,
      cardAccountId: CARD_ACCOUNT_ID,
    });
    const history = store.fetchContext({
      ownerUserId: OWNER_ID,
      accountId: CARD_ACCOUNT_ID,
      contentHash: hashImportContent(overlappingFile),
      identityKeys: preview.rows.map((row) =>
        buildImportRowIdentityKey(row, CARD_ACCOUNT_ID),
      ),
      externalIds: [],
    });

    const enriched = enrichImportPreviewWithHistory(
      preview,
      history,
      CARD_ACCOUNT_ID,
    );

    expect(enriched.historicalSummary?.partialOverlap).toBe(true);
    expect(enriched.summary.historicalNewRowCount).toBe(1);
    expect(enriched.summary.historicalAlreadyImportedRowCount).toBe(1);
    expect(
      enriched.rows.find((row) => row.description === "Test Store")?.historicalStatus,
    ).toBe("already_imported");
    expect(
      enriched.rows.find((row) => row.description === "Brand New Store")?.historicalStatus,
    ).toBe("new");
  });

  it("keeps reversal pairs valid while still matching historical identities", () => {
    registerPreview({
      content: CHECKING_FIXTURE,
      accountId: CHECKING_ACCOUNT_ID,
    });

    const preview = buildImportPreview({ content: CHECKING_FIXTURE });
    const history = store.fetchContext({
      ownerUserId: OWNER_ID,
      accountId: CHECKING_ACCOUNT_ID,
      contentHash: hashImportContent(CHECKING_FIXTURE),
      identityKeys: preview.rows.map((row) =>
        buildImportRowIdentityKey(row, CHECKING_ACCOUNT_ID),
      ),
      externalIds: preview.rows.map((row) => row.externalId).filter(Boolean) as string[],
    });

    const enriched = enrichImportPreviewWithHistory(
      preview,
      history,
      CHECKING_ACCOUNT_ID,
    );
    const reversalUuid = "6a5cff73-490e-4f8e-8e67-953f71d273d1";
    const pairRows = enriched.rows.filter((row) => row.externalId === reversalUuid);

    expect(pairRows).toHaveLength(2);
    expect(pairRows.every((row) => row.historicalStatus === "already_imported")).toBe(true);
    expect(
      enriched.warnings.some(
        (warning) => warning.code === "reversal_pair" && warning.externalId === reversalUuid,
      ),
    ).toBe(true);
  });

  it("defaults rows to historicalStatus new before enrichment", () => {
    const preview = buildImportPreview({
      content: CARD_FIXTURE,
      cardAccountId: CARD_ACCOUNT_ID,
    });

    expect(withDefaultHistoricalRows(preview.rows).every((row) => row.historicalStatus === "new")).toBe(
      true,
    );
  });
});
