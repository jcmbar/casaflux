import { describe, expect, it } from "vitest";

import {
  buildImportSkippedRowsMessage,
  formatCommitSkippedSourceLines,
  mergeCommitSkippedRows,
  partitionCommitPayloadByExistingIdentities,
} from "./filter-commit-duplicates";

describe("partitionCommitPayloadByExistingIdentities", () => {
  it("keeps only rows whose identity keys are not in history", () => {
    const payload = [
      { source_line: 2, identity_key: "key-new" },
      { source_line: 5, identity_key: "key-old" },
      { source_line: 8, identity_key: "key-new-2" },
    ];

    const { committable, skipped } = partitionCommitPayloadByExistingIdentities(
      payload,
      new Set(["key-old"]),
    );

    expect(committable.map((row) => row.source_line)).toEqual([2, 8]);
    expect(skipped).toEqual([
      { sourceLine: 5, identityKey: "key-old" },
    ]);
  });
});

describe("mergeCommitSkippedRows", () => {
  it("deduplicates skipped rows by source line and identity key", () => {
    expect(
      mergeCommitSkippedRows(
        [{ sourceLine: 5, identityKey: "a" }],
        [
          { sourceLine: 5, identityKey: "a" },
          { sourceLine: 2, identityKey: "b" },
        ],
      ),
    ).toEqual([
      { sourceLine: 2, identityKey: "b" },
      { sourceLine: 5, identityKey: "a" },
    ]);
  });
});

describe("import skipped row messaging", () => {
  it("builds a friendly message with line numbers", () => {
    expect(
      buildImportSkippedRowsMessage([
        { sourceLine: 3, identityKey: "a" },
        { sourceLine: 12, identityKey: "b" },
      ]),
    ).toBe(
      "2 linhas deste arquivo já haviam sido importadas e foram ignoradas (L3, L12).",
    );
  });

  it("truncates long line lists in the message", () => {
    const skipped = Array.from({ length: 10 }, (_, index) => ({
      sourceLine: index + 1,
      identityKey: `key-${index}`,
    }));

    expect(formatCommitSkippedSourceLines(skipped, 3)).toBe(
      "L1, L2, L3 e mais 7",
    );
  });
});
