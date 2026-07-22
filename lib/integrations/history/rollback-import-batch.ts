import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyTransactionsChanged } from "@/lib/finance/create-transaction";
import { collectImportedTransactionIds } from "@/lib/finance/transaction-origin";

export type ImportBatchRollbackImpact = {
  batchId: string;
  fileName: string | null;
  accountId: string;
  status: string;
  /** Distinct transactions created by this batch (incl. invoice twins). */
  transactionCount: number;
  /** Batch rows that produced at least one transaction. */
  createdItemCount: number;
  /** Rows recognized as invoice payments. */
  invoicePaymentCount: number;
  /** Imported statement cycles tied to this batch. */
  importedCycleCount: number;
  /** Transactions whose amount/date no longer match the batch snapshot. */
  editedTransactionCount: number;
  /** Manual payments that will lose reconcile link to this batch. */
  reconciledManualCount: number;
  warnings: string[];
  /** Hard blockers — rollback should not proceed. */
  blockers: string[];
  canRollback: boolean;
};

export type PreviewImportBatchRollbackResult =
  | { ok: true; impact: ImportBatchRollbackImpact }
  | { ok: false; message: string };

export type RollbackImportBatchResult =
  | {
      ok: true;
      batchId: string;
      deletedTransactions: number;
      deletedBatchRows: number;
      deletedCycles: number;
      /** Cycles kept only when remaining activity exists, with import_batch_id cleared. */
      unlinkedCycles: number;
      invoicePaymentRows: number;
      classificationMemoryRows: number;
      accountId: string;
    }
  | { ok: false; message: string };

type BatchRow = {
  id: string;
  batch_id: string;
  kind: string;
  row_date: string;
  amount: number | string;
  description: string;
  transaction_id: string | null;
  linked_transaction_id: string | null;
};

type TransactionSnap = {
  id: string;
  amount: number | string;
  transaction_date: string;
  description: string;
  type: string;
  reconciled_with_transaction_id: string | null;
  linked_transaction_id: string | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function amountsDiffer(left: number, right: number): boolean {
  return Math.abs(roundMoney(left) - roundMoney(right)) > 0.005;
}

/**
 * Builds user-facing confirm copy from a rollback impact preview.
 */
export function buildImportBatchRollbackConfirmCopy(
  impact: ImportBatchRollbackImpact,
): { title: string; description: string; confirmLabel: string } {
  const lines: string[] = [
    "Isso desfaz somente esta importação e reverte os saldos afetados.",
  ];

  lines.push(
    `• ${impact.transactionCount} lançamento(s) serão removidos`,
  );

  if (impact.invoicePaymentCount > 0) {
    lines.push(
      `• ${impact.invoicePaymentCount} pagamento(s) de fatura deste lote`,
    );
  }

  if (impact.importedCycleCount > 0) {
    lines.push(
      `• ${impact.importedCycleCount} ciclo(s)/fatura(s) importada(s) vinculada(s)`,
    );
  }

  for (const warning of impact.warnings) {
    lines.push(`• Atenção: ${warning}`);
  }

  lines.push("Depois você poderá importar o mesmo arquivo de novo.");
  lines.push("Essa ação não pode ser desfeita.");

  return {
    title: "Excluir importação",
    description: lines.join("\n"),
    confirmLabel: "Excluir importação",
  };
}

export function assessImportBatchRollbackImpact(input: {
  batchId: string;
  fileName: string | null;
  accountId: string;
  status: string;
  rows: BatchRow[];
  transactions: TransactionSnap[];
  importedCycleCount: number;
}): ImportBatchRollbackImpact {
  const importedIds = collectImportedTransactionIds(input.rows);
  const txById = new Map(input.transactions.map((tx) => [tx.id, tx]));

  let createdItemCount = 0;
  let invoicePaymentCount = 0;
  let editedTransactionCount = 0;
  const warnings: string[] = [];
  const blockers: string[] = [];

  for (const row of input.rows) {
    if (row.transaction_id || row.linked_transaction_id) {
      createdItemCount += 1;
    }
    if (row.kind === "card_invoice_payment") {
      invoicePaymentCount += 1;
    }

    const primary = row.transaction_id
      ? txById.get(row.transaction_id)
      : undefined;
    if (primary) {
      const rowAmount = Math.abs(Number(row.amount));
      const txAmount = Math.abs(Number(primary.amount));
      const rowDate = row.row_date.slice(0, 10);
      const txDate = primary.transaction_date.slice(0, 10);
      if (amountsDiffer(rowAmount, txAmount) || rowDate !== txDate) {
        editedTransactionCount += 1;
      }
    }
  }

  let reconciledManualCount = 0;
  for (const tx of input.transactions) {
    if (tx.type === "transfer") {
      blockers.push(
        "Esta importação contém uma transferência e não pode ser desfeita com segurança.",
      );
    }

    if (
      tx.reconciled_with_transaction_id &&
      !importedIds.has(tx.reconciled_with_transaction_id)
    ) {
      reconciledManualCount += 1;
    }

    if (
      tx.linked_transaction_id &&
      !importedIds.has(tx.linked_transaction_id)
    ) {
      blockers.push(
        "Há lançamentos vinculados fora deste lote. Desfaça o vínculo antes de excluir a importação.",
      );
    }
  }

  // Missing txs that batch rows still point to (already deleted manually).
  for (const id of importedIds) {
    if (!txById.has(id)) {
      warnings.push(
        "Alguns lançamentos deste lote já foram removidos manualmente; o restante será revertido.",
      );
      break;
    }
  }

  if (editedTransactionCount > 0) {
    warnings.push(
      `${editedTransactionCount} lançamento(s) foram editados após a importação (valor ou data). A exclusão usará os valores atuais para reverter o saldo.`,
    );
  }

  if (reconciledManualCount > 0) {
    warnings.push(
      `${reconciledManualCount} pagamento(s) manual(is) perderão a conciliação com este lote (os manuais permanecem).`,
    );
  }

  const uniqueBlockers = [...new Set(blockers)];

  return {
    batchId: input.batchId,
    fileName: input.fileName,
    accountId: input.accountId,
    status: input.status,
    transactionCount: importedIds.size,
    createdItemCount,
    invoicePaymentCount,
    importedCycleCount: input.importedCycleCount,
    editedTransactionCount,
    reconciledManualCount,
    warnings: [...new Set(warnings)],
    blockers: uniqueBlockers,
    canRollback: uniqueBlockers.length === 0,
  };
}

/**
 * Loads impact summary before confirming rollback.
 */
export async function previewImportBatchRollback(
  supabase: SupabaseClient,
  input: { batchId: string; ownerUserId: string },
): Promise<PreviewImportBatchRollbackResult> {
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id, owner_user_id, account_id, file_name, status")
    .eq("id", input.batchId)
    .eq("owner_user_id", input.ownerUserId)
    .maybeSingle();

  if (batchError) {
    return { ok: false, message: batchError.message };
  }

  if (!batch) {
    return { ok: false, message: "Importação não encontrada." };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("import_batch_rows")
    .select(
      "id, batch_id, kind, row_date, amount, description, transaction_id, linked_transaction_id",
    )
    .eq("batch_id", input.batchId);

  if (rowsError) {
    return { ok: false, message: rowsError.message };
  }

  const batchRows = (rows ?? []) as BatchRow[];
  const txIds = [...collectImportedTransactionIds(batchRows)];

  let transactions: TransactionSnap[] = [];
  if (txIds.length > 0) {
    const { data: txData, error: txError } = await supabase
      .from("transactions")
      .select(
        "id, amount, transaction_date, description, type, reconciled_with_transaction_id, linked_transaction_id",
      )
      .in("id", txIds);

    if (txError) {
      return { ok: false, message: txError.message };
    }

    transactions = (txData ?? []) as TransactionSnap[];
  }

  const { count: cycleCount, error: cycleError } = await supabase
    .from("card_statement_cycles")
    .select("id", { count: "exact", head: true })
    .eq("import_batch_id", input.batchId);

  if (cycleError) {
    // Table may not exist yet locally; treat as zero cycles.
    console.error(cycleError);
  }

  const impact = assessImportBatchRollbackImpact({
    batchId: batch.id as string,
    fileName: (batch.file_name as string | null) ?? null,
    accountId: batch.account_id as string,
    status: batch.status as string,
    rows: batchRows,
    transactions,
    importedCycleCount: cycleCount ?? 0,
  });

  return { ok: true, impact };
}

function mapRpcErrorMessage(message: string): string {
  if (/not authenticated/i.test(message)) {
    return "Faça login novamente para excluir a importação.";
  }
  if (/not allowed|cannot edit|42501/i.test(message)) {
    return "Você não tem permissão para excluir esta importação.";
  }
  if (/not found/i.test(message)) {
    return "Importação não encontrada.";
  }
  if (/transfer/i.test(message)) {
    return "Esta importação contém uma transferência e não pode ser desfeita com segurança.";
  }
  return message || "Não foi possível excluir a importação.";
}

/**
 * Atomically rolls back one import batch via RPC.
 */
export async function rollbackImportBatch(
  supabase: SupabaseClient,
  batchId: string,
): Promise<RollbackImportBatchResult> {
  if (!batchId) {
    return { ok: false, message: "Importação inválida." };
  }

  const { data, error } = await supabase.rpc("rollback_import_batch", {
    p_batch_id: batchId,
  });

  if (error) {
    console.error(error);
    return { ok: false, message: mapRpcErrorMessage(error.message) };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  notifyTransactionsChanged();

  return {
    ok: true,
    batchId: String(row.batchId ?? batchId),
    deletedTransactions: Number(row.deletedTransactions ?? 0),
    deletedBatchRows: Number(row.deletedBatchRows ?? 0),
    deletedCycles: Number(row.deletedCycles ?? 0),
    unlinkedCycles: Number(row.unlinkedCycles ?? 0),
    invoicePaymentRows: Number(row.invoicePaymentRows ?? 0),
    classificationMemoryRows: Number(row.classificationMemoryRows ?? 0),
    accountId: String(row.accountId ?? ""),
  };
}
