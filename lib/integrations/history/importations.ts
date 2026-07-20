import type { SupabaseClient } from "@supabase/supabase-js";

import { importKindLabels, importSourceLabels } from "../ui/labels";
import type { ImportSource, NormalizedImportKind } from "../types";
import type { ImportBatchStatus, ImportHistoryBatchRecord } from "./types";

export const IMPORTACOES_ROUTES = {
  list: "/importacoes",
  nova: "/importacoes/nova",
  detail: (batchId: string) => `/importacoes/${batchId}`,
} as const;

export const importBatchStatusLabels: Record<ImportBatchStatus, string> = {
  committed: "Concluída",
  registered: "Registrada",
  failed: "Falhou",
};

export const IMPORTATION_SECTION_LABELS = {
  created: "Itens criados",
  ignored: "Itens ignorados",
  invoice_payments: "Pagamentos de fatura reconhecidos",
} as const;

export type ImportationSectionId = keyof typeof IMPORTATION_SECTION_LABELS;

export type ImportationListItem = {
  id: string;
  source: ImportSource;
  sourceLabel: string;
  title: string;
  fileName: string | null;
  accountId: string;
  accountName: string | null;
  status: ImportBatchStatus;
  statusLabel: string;
  rowCount: number;
  createdLaunchCount: number;
  invoicePaymentCount: number;
  importedAt: string;
  href: string;
};

export type ImportationDetailRow = {
  id: string;
  sourceLine: number;
  kind: NormalizedImportKind;
  kindLabel: string;
  rowDate: string;
  amount: number;
  direction: "in" | "out";
  description: string;
  createdLaunch: boolean;
  isInvoicePayment: boolean;
  resultLabel: string;
};

export type ImportationDetailSection = {
  id: ImportationSectionId;
  label: string;
  description: string;
  rows: ImportationDetailRow[];
};

export type ImportationDetailSummary = {
  /** Rows persisted for this import (file lines that entered the history). */
  fileRows: number;
  /** Financial launches created (includes twin legs, e.g. invoice payment). */
  createdLaunches: number;
  /** File lines that produced at least one launch. */
  createdItems: number;
  /** File lines that did not create a new launch. */
  ignoredItems: number;
  /** Invoice-payment lines recognized in this import. */
  invoicePayments: number;
};

export type ImportationDetail = ImportationListItem & {
  contentHash: string;
  familyId: string | null;
  rows: ImportationDetailRow[];
  summary: ImportationDetailSummary;
  sections: ImportationDetailSection[];
  reimportHref: string;
};

type BatchDbRow = {
  id: string;
  owner_user_id: string;
  family_id: string | null;
  account_id: string;
  source: ImportSource;
  file_name: string | null;
  content_hash: string;
  row_count: number;
  status: ImportBatchStatus;
  imported_at: string;
  accounts?: { id: string; name: string } | { id: string; name: string }[] | null;
};

type BatchRowDb = {
  id: string;
  batch_id: string;
  source_line: number;
  kind: NormalizedImportKind;
  row_date: string;
  amount: number;
  direction: "in" | "out";
  description: string;
  transaction_id: string | null;
  linked_transaction_id: string | null;
};

export function buildImportationTitle(source: ImportSource): string {
  switch (source) {
    case "nubank_credit_card":
      return "Importação do Nubank (cartão)";
    case "nubank_checking":
      return "Importação do Nubank (conta)";
    default:
      return "Importação";
  }
}

export function getImportationRowKindLabel(kind: NormalizedImportKind): string {
  if (kind === "card_invoice_payment") {
    return "Pagamento de fatura";
  }
  return importKindLabels[kind] ?? kind;
}

export function getImportationRowResultLabel(row: {
  createdLaunch: boolean;
  isInvoicePayment: boolean;
}): string {
  if (row.isInvoicePayment && row.createdLaunch) {
    return "Pagamento de fatura reconhecido";
  }
  if (row.isInvoicePayment) {
    return "Pagamento de fatura (sem lançamento novo)";
  }
  if (row.createdLaunch) {
    return "Lançamento criado";
  }
  return "Item ignorado";
}

/**
 * Guided reimport entry: opens the existing review flow with account/source context.
 * Does not auto-upload a file — the user still selects a CSV safely.
 */
export function buildGuidedReimportHref(input: {
  batchId: string;
  accountId: string;
  source: ImportSource;
}): string {
  const params = new URLSearchParams({
    from: input.batchId,
    account: input.accountId,
    source: input.source,
  });
  return `${IMPORTACOES_ROUTES.nova}?${params.toString()}`;
}

export function parseGuidedReimportSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): {
  fromBatchId: string | null;
  accountId: string | null;
  source: ImportSource | null;
} {
  const fromBatchId = searchParams.get("from");
  const accountId = searchParams.get("account");
  const sourceRaw = searchParams.get("source");
  const source =
    sourceRaw === "nubank_credit_card" || sourceRaw === "nubank_checking"
      ? sourceRaw
      : null;

  return {
    fromBatchId: fromBatchId?.trim() || null,
    accountId: accountId?.trim() || null,
    source,
  };
}

export function getGuidedReimportIntro(input: {
  source: ImportSource | null;
  accountName?: string | null;
}): string {
  const origin =
    input.source === "nubank_credit_card"
      ? "cartão Nubank"
      : input.source === "nubank_checking"
        ? "conta Nubank"
        : "Nubank";
  const accountHint = input.accountName
    ? ` A conta sugerida é “${input.accountName}”.`
    : "";

  return `Você está importando novamente a partir de uma importação anterior (${origin}). Envie um CSV atualizado — linhas já importadas serão reconhecidas e não duplicadas.${accountHint}`;
}

export function mapImportationDetailRow(row: BatchRowDb): ImportationDetailRow {
  const createdLaunch = Boolean(row.transaction_id);
  const isInvoicePayment = row.kind === "card_invoice_payment";
  const mapped = {
    id: row.id,
    sourceLine: row.source_line,
    kind: row.kind,
    kindLabel: getImportationRowKindLabel(row.kind),
    rowDate: row.row_date,
    amount: Number(row.amount),
    direction: row.direction,
    description: row.description,
    createdLaunch,
    isInvoicePayment,
  };

  return {
    ...mapped,
    resultLabel: getImportationRowResultLabel(mapped),
  };
}

export function summarizeImportBatchRows(rows: BatchRowDb[]): {
  createdLaunchCount: number;
  createdItemCount: number;
  invoicePaymentCount: number;
  ignoredItemCount: number;
} {
  let createdLaunchCount = 0;
  let createdItemCount = 0;
  let invoicePaymentCount = 0;
  let ignoredItemCount = 0;

  for (const row of rows) {
    const created = Boolean(row.transaction_id);
    if (created) {
      createdItemCount += 1;
      createdLaunchCount += 1;
      if (row.linked_transaction_id) {
        // Twin leg also created (e.g. invoice payment source+card).
        createdLaunchCount += 1;
      }
    } else {
      ignoredItemCount += 1;
    }

    if (row.kind === "card_invoice_payment") {
      invoicePaymentCount += 1;
    }
  }

  return {
    createdLaunchCount,
    createdItemCount,
    invoicePaymentCount,
    ignoredItemCount,
  };
}

export function buildImportationDetailSections(
  rows: ImportationDetailRow[],
): ImportationDetailSection[] {
  const created = rows.filter(
    (row) => row.createdLaunch && !row.isInvoicePayment,
  );
  const ignored = rows.filter((row) => !row.createdLaunch);
  const invoicePayments = rows.filter((row) => row.isInvoicePayment);

  const sections: ImportationDetailSection[] = [];

  if (created.length > 0) {
    sections.push({
      id: "created",
      label: IMPORTATION_SECTION_LABELS.created,
      description: "Linhas do arquivo que geraram lançamentos novos.",
      rows: created,
    });
  }

  if (invoicePayments.length > 0) {
    sections.push({
      id: "invoice_payments",
      label: IMPORTATION_SECTION_LABELS.invoice_payments,
      description:
        "Pagamentos de fatura identificados nesta importação (com ou sem lançamento novo).",
      rows: invoicePayments,
    });
  }

  if (ignored.length > 0) {
    sections.push({
      id: "ignored",
      label: IMPORTATION_SECTION_LABELS.ignored,
      description:
        "Linhas registradas sem criar lançamento novo (já existiam ou não entraram na gravação).",
      rows: ignored,
    });
  }

  return sections;
}

export function buildImportationDetailSummary(
  rows: BatchRowDb[],
  fallbackRowCount: number,
): ImportationDetailSummary {
  const counts = summarizeImportBatchRows(rows);
  return {
    fileRows: rows.length || fallbackRowCount,
    createdLaunches: counts.createdLaunchCount,
    createdItems: counts.createdItemCount,
    ignoredItems: counts.ignoredItemCount,
    invoicePayments: counts.invoicePaymentCount,
  };
}

export function mapImportationListItem(input: {
  batch: Pick<
    ImportHistoryBatchRecord,
    | "id"
    | "source"
    | "fileName"
    | "accountId"
    | "status"
    | "rowCount"
    | "importedAt"
  >;
  accountName: string | null;
  createdLaunchCount: number;
  invoicePaymentCount: number;
}): ImportationListItem {
  return {
    id: input.batch.id,
    source: input.batch.source,
    sourceLabel: importSourceLabels[input.batch.source],
    title: buildImportationTitle(input.batch.source),
    fileName: input.batch.fileName,
    accountId: input.batch.accountId,
    accountName: input.accountName,
    status: input.batch.status,
    statusLabel: importBatchStatusLabels[input.batch.status],
    rowCount: input.batch.rowCount,
    createdLaunchCount: input.createdLaunchCount,
    invoicePaymentCount: input.invoicePaymentCount,
    importedAt: input.batch.importedAt,
    href: IMPORTACOES_ROUTES.detail(input.batch.id),
  };
}

function embedAccountName(
  accounts:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null
    | undefined,
): string | null {
  if (!accounts) return null;
  if (Array.isArray(accounts)) {
    return accounts[0]?.name ?? null;
  }
  return accounts.name ?? null;
}

function mapBatchRecord(row: BatchDbRow): ImportHistoryBatchRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    familyId: row.family_id,
    accountId: row.account_id,
    source: row.source,
    fileName: row.file_name,
    contentHash: row.content_hash,
    rowCount: Number(row.row_count),
    status: row.status,
    importedAt: row.imported_at,
  };
}

/**
 * Lists import batches for the signed-in user (newest first).
 */
export async function listImportations(
  supabase: SupabaseClient,
  input: { ownerUserId: string; limit?: number },
): Promise<{ items: ImportationListItem[]; error: string | null }> {
  let query = supabase
    .from("import_batches")
    .select(
      "id, owner_user_id, family_id, account_id, source, file_name, content_hash, row_count, status, imported_at, accounts ( id, name )",
    )
    .eq("owner_user_id", input.ownerUserId)
    .order("imported_at", { ascending: false });

  if (input.limit != null) {
    query = query.limit(input.limit);
  }

  const { data, error } = await query;

  if (error) {
    return { items: [], error: error.message };
  }

  const batches = (data ?? []) as BatchDbRow[];
  if (batches.length === 0) {
    return { items: [], error: null };
  }

  const batchIds = batches.map((batch) => batch.id);
  const { data: rowData, error: rowError } = await supabase
    .from("import_batch_rows")
    .select(
      "id, batch_id, source_line, kind, row_date, amount, direction, description, transaction_id, linked_transaction_id",
    )
    .in("batch_id", batchIds);

  if (rowError) {
    return { items: [], error: rowError.message };
  }

  const rowsByBatch = new Map<string, BatchRowDb[]>();
  for (const row of (rowData ?? []) as BatchRowDb[]) {
    const list = rowsByBatch.get(row.batch_id) ?? [];
    list.push(row);
    rowsByBatch.set(row.batch_id, list);
  }

  const items = batches.map((batch) => {
    const summary = summarizeImportBatchRows(rowsByBatch.get(batch.id) ?? []);
    const record = mapBatchRecord(batch);
    return mapImportationListItem({
      batch: {
        id: record.id,
        source: record.source,
        fileName: record.fileName,
        accountId: record.accountId,
        status: record.status,
        rowCount: record.rowCount,
        importedAt: record.importedAt,
      },
      accountName: embedAccountName(batch.accounts),
      createdLaunchCount: summary.createdLaunchCount,
      invoicePaymentCount: summary.invoicePaymentCount,
    });
  });

  return { items, error: null };
}

/**
 * Loads one import batch with row-level summary for the detail screen.
 */
export async function fetchImportationDetail(
  supabase: SupabaseClient,
  input: { batchId: string; ownerUserId: string },
): Promise<{ detail: ImportationDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from("import_batches")
    .select(
      "id, owner_user_id, family_id, account_id, source, file_name, content_hash, row_count, status, imported_at, accounts ( id, name )",
    )
    .eq("id", input.batchId)
    .eq("owner_user_id", input.ownerUserId)
    .maybeSingle();

  if (error) {
    return { detail: null, error: error.message };
  }

  if (!data) {
    return { detail: null, error: null };
  }

  const batch = data as BatchDbRow;
  const { data: rowData, error: rowError } = await supabase
    .from("import_batch_rows")
    .select(
      "id, batch_id, source_line, kind, row_date, amount, direction, description, transaction_id, linked_transaction_id",
    )
    .eq("batch_id", batch.id)
    .order("source_line", { ascending: true });

  if (rowError) {
    return { detail: null, error: rowError.message };
  }

  const rows = (rowData ?? []) as BatchRowDb[];
  const record = mapBatchRecord(batch);
  const accountName = embedAccountName(batch.accounts);
  const detailSummary = buildImportationDetailSummary(rows, record.rowCount);
  const detailRows = rows.map(mapImportationDetailRow);
  const listItem = mapImportationListItem({
    batch: {
      id: record.id,
      source: record.source,
      fileName: record.fileName,
      accountId: record.accountId,
      status: record.status,
      rowCount: record.rowCount,
      importedAt: record.importedAt,
    },
    accountName,
    createdLaunchCount: detailSummary.createdLaunches,
    invoicePaymentCount: detailSummary.invoicePayments,
  });

  return {
    detail: {
      ...listItem,
      contentHash: record.contentHash,
      familyId: record.familyId,
      rows: detailRows,
      summary: detailSummary,
      sections: buildImportationDetailSections(detailRows),
      reimportHref: buildGuidedReimportHref({
        batchId: record.id,
        accountId: record.accountId,
        source: record.source,
      }),
    },
    error: null,
  };
}

export function getImportationsEmptyMessage(): string {
  return "Você ainda não importou nenhum arquivo. Comece com um CSV do Nubank.";
}
