import { describe, expect, it } from "vitest";

import { getCommittableImportRows } from "../commit/map-import-row";
import { buildImportPreview } from "./import-orchestrator";
import {
  buildImportDuplicateAttention,
  formatImportDuplicateHeadline,
  formatImportDuplicateReason,
  getImportRowDuplicateReason,
  resolveIntraFileDuplicateReasonCode,
} from "./import-duplicate-attention";
import { enrichImportPreviewWithHistory } from "../history/compare-preview-with-history";
import { buildImportRowIdentityKey } from "../history/row-identity";
import type { ImportHistoryContext, ImportHistoryRowMatch } from "../history/types";
import type { ImportPreviewRow } from "../types";

const CARD_ACCOUNT_ID = "card-account-1";

function committableLines(rows: ImportPreviewRow[]): Set<number> {
  return new Set(
    getCommittableImportRows(rows, {}).map((row) => row.sourceLine),
  );
}

describe("resolveIntraFileDuplicateReasonCode", () => {
  it("maps externalId keys and content keys without bank hardcode", () => {
    expect(resolveIntraFileDuplicateReasonCode("externalId:abc")).toBe(
      "same_bank_id_in_file",
    );
    expect(
      resolveIntraFileDuplicateReasonCode("2026-07-01:10:test store:"),
    ).toBe("same_content_in_file");
  });
});

describe("formatImportDuplicateHeadline", () => {
  it("uses calm product language", () => {
    expect(
      formatImportDuplicateHeadline({
        intraFileCount: 0,
        alreadyInCasafluxCount: 3,
        conflictCount: 0,
      }),
    ).toBe("3 lançamentos parecem já existir no Casaflux");

    expect(
      formatImportDuplicateHeadline({
        intraFileCount: 2,
        alreadyInCasafluxCount: 0,
        conflictCount: 0,
      }),
    ).toBe("2 linhas repetidas neste arquivo");
  });
});

describe("buildImportDuplicateAttention", () => {
  it("explains Nubank card intra-file duplicates with content reason", () => {
    const content = [
      "date,title,amount",
      '2026-07-01,Test Store,"10,00"',
      '2026-07-01,Test Store,"10,00"',
      '2026-07-02,Other Store,"20,00"',
    ].join("\n");

    const preview = buildImportPreview({
      content,
      cardAccountId: CARD_ACCOUNT_ID,
    });

    const attention = buildImportDuplicateAttention({
      rows: preview.rows,
      possibleDuplicates: preview.possibleDuplicates,
      committableSourceLines: committableLines(preview.rows),
    });

    expect(attention).not.toBeNull();
    expect(attention?.intraFileCount).toBe(1);
    expect(attention?.headline).toBe("1 linha repetida neste arquivo");
    expect(attention?.outcomeSummary).toContain("será gravado");
    expect(attention?.outcomeSummary).toContain("ficará de fora");

    const duplicateLine = attention?.lines.find((line) => !line.willImport);
    expect(duplicateLine?.reasonCode).toBe("same_content_in_file");
    expect(duplicateLine?.reason).toBe(
      formatImportDuplicateReason("same_content_in_file"),
    );

    const kept = attention?.lines.find((line) => line.willImport);
    expect(kept?.sourceLine).toBe(2);
  });

  it("explains Inter/checking duplicates by bank identifier", () => {
    const content = [
      "Data,Valor,Identificador,Descrição",
      "01/07/2026,-10.00,duplicate-id-1,Transferência enviada pelo Pix - Foo",
      "02/07/2026,-20.00,duplicate-id-1,Transferência enviada pelo Pix - Bar",
      "03/07/2026,-5.00,unique-id,Transferência enviada pelo Pix - Baz",
    ].join("\n");

    const preview = buildImportPreview({ content });
    const attention = buildImportDuplicateAttention({
      rows: preview.rows,
      possibleDuplicates: preview.possibleDuplicates,
      committableSourceLines: committableLines(preview.rows),
    });

    expect(attention?.intraFileCount).toBe(1);
    expect(attention?.groups[0]?.reasonCode).toBe("same_bank_id_in_file");
    expect(attention?.lines.some((line) => line.reasonCode === "same_bank_id_in_file")).toBe(
      true,
    );
    expect(
      getImportRowDuplicateReason(
        preview.rows.find((row) => row.reviewStatus === "possible_duplicate")!,
        preview.possibleDuplicates,
      ),
    ).toBe(formatImportDuplicateReason("same_bank_id_in_file"));
  });

  it("explains historical Casaflux matches with fingerprint reason", () => {
    const content = [
      "Data,Valor,Identificador,Descrição",
      "01/07/2026,-10.00,id-1,Transferência enviada pelo Pix - Foo",
      "02/07/2026,50.00,id-2,Transferência Recebida - Bar",
    ].join("\n");

    const preview = buildImportPreview({ content });
    const accountId = "checking-1";
    const match: ImportHistoryRowMatch = {
      batchId: "batch-1",
      identityKey: buildImportRowIdentityKey(preview.rows[0]!, accountId),
      externalId: "id-1",
      importedAt: "2026-07-10T00:00:00.000Z",
    };

    const history: ImportHistoryContext = {
      contentHash: "hash",
      matchingBatches: [],
      rowsByIdentityKey: new Map([[match.identityKey, match]]),
      rowsByExternalId: new Map(),
    };

    const enriched = enrichImportPreviewWithHistory(preview, history, accountId);
    const attention = buildImportDuplicateAttention({
      rows: enriched.rows,
      possibleDuplicates: enriched.possibleDuplicates,
      committableSourceLines: committableLines(enriched.rows),
    });

    expect(attention?.alreadyInCasafluxCount).toBe(1);
    expect(attention?.headline).toBe(
      "1 lançamento parece já existir no Casaflux",
    );
    expect(attention?.outcomeSummary).toBe(
      "Nenhum desses será gravado nesta importação.",
    );
    expect(attention?.lines[0]?.reasonCode).toBe("already_in_casaflux");
    expect(attention?.lines[0]?.willImport).toBe(false);

    // Ready row remains outside duplicate attention when not duplicated.
    expect(attention?.lines).toHaveLength(1);
    expect(
      getCommittableImportRows(enriched.rows, {}).map((row) => row.sourceLine),
    ).toEqual([3]);
  });

  it("keeps ready vs ignored counts aligned with commit rules", () => {
    const content = [
      "date,title,amount",
      '2026-07-01,Test Store,"10,00"',
      '2026-07-01,Test Store,"10,00"',
    ].join("\n");

    const preview = buildImportPreview({
      content,
      cardAccountId: CARD_ACCOUNT_ID,
    });
    const committable = getCommittableImportRows(preview.rows, {});
    const attention = buildImportDuplicateAttention({
      rows: preview.rows,
      possibleDuplicates: preview.possibleDuplicates,
      committableSourceLines: new Set(committable.map((row) => row.sourceLine)),
    });

    expect(committable).toHaveLength(1);
    expect(attention?.lines.filter((line) => line.willImport)).toHaveLength(1);
    expect(attention?.lines.filter((line) => !line.willImport)).toHaveLength(1);
  });
});
