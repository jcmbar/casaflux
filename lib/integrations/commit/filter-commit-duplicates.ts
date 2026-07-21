import type { SupabaseClient } from "@supabase/supabase-js";

export type CommitSkippedImportRow = {
  sourceLine: number;
  identityKey: string;
};

export type RpcCommitRowPayload = {
  source_line: number;
  identity_key: string;
};

const IDENTITY_KEY_QUERY_CHUNK_SIZE = 200;

export async function fetchExistingImportIdentityKeys(
  supabase: SupabaseClient,
  input: {
    ownerUserId: string;
    accountId: string;
    identityKeys: string[];
  },
): Promise<Set<string>> {
  const uniqueKeys = [...new Set(input.identityKeys.filter(Boolean))];
  if (uniqueKeys.length === 0) {
    return new Set();
  }

  const existing = new Set<string>();

  for (let index = 0; index < uniqueKeys.length; index += IDENTITY_KEY_QUERY_CHUNK_SIZE) {
    const chunk = uniqueKeys.slice(index, index + IDENTITY_KEY_QUERY_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("import_batch_rows")
      .select("identity_key")
      .eq("owner_user_id", input.ownerUserId)
      .eq("account_id", input.accountId)
      .in("identity_key", chunk);

    if (error) {
      throw error;
    }

    for (const row of data ?? []) {
      const identityKey = (row as { identity_key: string }).identity_key;
      if (identityKey) {
        existing.add(identityKey);
      }
    }
  }

  return existing;
}

export function partitionCommitPayloadByExistingIdentities<
  T extends RpcCommitRowPayload,
>(
  payload: T[],
  existingKeys: ReadonlySet<string>,
): { committable: T[]; skipped: CommitSkippedImportRow[] } {
  const committable: T[] = [];
  const skipped: CommitSkippedImportRow[] = [];

  for (const row of payload) {
    if (existingKeys.has(row.identity_key)) {
      skipped.push({
        sourceLine: row.source_line,
        identityKey: row.identity_key,
      });
      continue;
    }

    committable.push(row);
  }

  return { committable, skipped };
}

export function mergeCommitSkippedRows(
  ...groups: CommitSkippedImportRow[][]
): CommitSkippedImportRow[] {
  const seen = new Set<string>();
  const merged: CommitSkippedImportRow[] = [];

  for (const group of groups) {
    for (const row of group) {
      const key = `${row.sourceLine}:${row.identityKey}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(row);
    }
  }

  return merged.sort((left, right) => left.sourceLine - right.sourceLine);
}

export function formatCommitSkippedSourceLines(
  skippedRows: CommitSkippedImportRow[],
  limit = 8,
): string {
  if (skippedRows.length === 0) {
    return "";
  }

  const labels = skippedRows.map((row) => `L${row.sourceLine}`);
  if (labels.length <= limit) {
    return labels.join(", ");
  }

  const visible = labels.slice(0, limit).join(", ");
  return `${visible} e mais ${labels.length - limit}`;
}

export function buildImportSkippedRowsMessage(
  skippedRows: CommitSkippedImportRow[],
): string {
  if (skippedRows.length === 0) {
    return "";
  }

  const lineSummary = formatCommitSkippedSourceLines(skippedRows);
  if (skippedRows.length === 1) {
    return `1 linha deste arquivo já havia sido importada e foi ignorada (${lineSummary}).`;
  }

  return `${skippedRows.length} linhas deste arquivo já haviam sido importadas e foram ignoradas (${lineSummary}).`;
}

export function parseAlreadyImportedRpcError(
  message: string,
): string | null {
  const match = message.match(/^Row already imported:\s*(.+)$/);
  return match?.[1]?.trim() ?? null;
}
