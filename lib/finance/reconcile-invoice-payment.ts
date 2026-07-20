import type { SupabaseClient } from "@supabase/supabase-js";

import type { ManualInvoicePaymentCandidate } from "@/lib/integrations/invoice-payment/suggest-invoice-payment-reconcile";

export type ManualInvoicePaymentCandidateRow = {
  id: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  account_id: string;
  transaction_date: string;
  statement_cycle_id: string | null;
  invoice_payment_origin: "manual" | "imported" | null;
  reconciled_with_transaction_id: string | null;
  linked_transaction_id: string | null;
};

/**
 * Loads unreconciled manual card-income legs for a credit card, plus their
 * linked source (expense) account when present.
 */
export async function fetchManualInvoicePaymentCandidates(
  supabase: SupabaseClient,
  input: {
    cardAccountId: string;
    /** Optional ISO lower bound (inclusive) to narrow the scan. */
    dateFrom?: string;
    dateTo?: string;
  },
): Promise<{
  candidates: ManualInvoicePaymentCandidate[];
  error: { message: string } | null;
}> {
  let query = supabase
    .from("transactions")
    .select(
      "id, amount, type, account_id, transaction_date, statement_cycle_id, invoice_payment_origin, reconciled_with_transaction_id, linked_transaction_id",
    )
    .eq("account_id", input.cardAccountId)
    .eq("type", "income")
    .eq("invoice_payment_origin", "manual")
    .is("reconciled_with_transaction_id", null)
    .order("transaction_date", { ascending: false });

  if (input.dateFrom) {
    query = query.gte("transaction_date", input.dateFrom);
  }
  if (input.dateTo) {
    query = query.lte("transaction_date", input.dateTo);
  }

  const { data, error } = await query;

  if (error) {
    return { candidates: [], error: { message: error.message } };
  }

  const rows = (data ?? []) as ManualInvoicePaymentCandidateRow[];
  const linkedIds = rows
    .map((row) => row.linked_transaction_id)
    .filter((id): id is string => Boolean(id));

  const sourceById = new Map<
    string,
    { id: string; account_id: string }
  >();

  if (linkedIds.length > 0) {
    const { data: linkedRows, error: linkedError } = await supabase
      .from("transactions")
      .select("id, account_id")
      .in("id", linkedIds);

    if (linkedError) {
      return { candidates: [], error: { message: linkedError.message } };
    }

    for (const linked of linkedRows ?? []) {
      sourceById.set(linked.id, {
        id: linked.id,
        account_id: linked.account_id,
      });
    }
  }

  const candidates: ManualInvoicePaymentCandidate[] = rows.map((row) => {
    const source = row.linked_transaction_id
      ? sourceById.get(row.linked_transaction_id)
      : null;

    return {
      cardTransactionId: row.id,
      sourceTransactionId: source?.id ?? row.linked_transaction_id,
      sourceAccountId: source?.account_id ?? null,
      cardAccountId: row.account_id,
      amount: Number(row.amount),
      paymentDate: row.transaction_date.slice(0, 10),
      statementCycleId: row.statement_cycle_id?.slice(0, 10) ?? null,
      reconciledWithTransactionId: row.reconciled_with_transaction_id,
    };
  });

  return { candidates, error: null };
}

export type InvoicePaymentReconcileLink = {
  /** Newly imported card income id. */
  importedCardTransactionId: string;
  /** Existing manual card income id. */
  manualCardTransactionId: string;
  importedSourceTransactionId?: string | null;
  manualSourceTransactionId?: string | null;
};

/**
 * Bidirectional link between manual and imported invoice payment legs.
 * Does not delete either side — settlement skips the manual leg when linked.
 */
export async function linkInvoicePaymentReconciliation(
  supabase: SupabaseClient,
  link: InvoicePaymentReconcileLink,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const {
    importedCardTransactionId,
    manualCardTransactionId,
    importedSourceTransactionId,
    manualSourceTransactionId,
  } = link;

  if (importedCardTransactionId === manualCardTransactionId) {
    return { ok: false, message: "Não é possível conciliar um lançamento consigo mesmo." };
  }

  const { error: importedCardError } = await supabase
    .from("transactions")
    .update({
      reconciled_with_transaction_id: manualCardTransactionId,
    })
    .eq("id", importedCardTransactionId);

  if (importedCardError) {
    console.error(importedCardError);
    return { ok: false, message: "Não foi possível vincular o pagamento importado." };
  }

  const { error: manualCardError } = await supabase
    .from("transactions")
    .update({
      reconciled_with_transaction_id: importedCardTransactionId,
    })
    .eq("id", manualCardTransactionId);

  if (manualCardError) {
    console.error(manualCardError);
    return { ok: false, message: "Não foi possível vincular o pagamento manual." };
  }

  if (
    importedSourceTransactionId &&
    manualSourceTransactionId &&
    importedSourceTransactionId !== manualSourceTransactionId
  ) {
    await supabase
      .from("transactions")
      .update({
        reconciled_with_transaction_id: manualSourceTransactionId,
      })
      .eq("id", importedSourceTransactionId);

    await supabase
      .from("transactions")
      .update({
        reconciled_with_transaction_id: importedSourceTransactionId,
      })
      .eq("id", manualSourceTransactionId);
  }

  return { ok: true };
}

export type BatchInvoicePaymentReconcileItem = {
  sourceLine: number;
  manualCardTransactionId: string;
  manualSourceTransactionId?: string | null;
};

/**
 * After `commit_nubank_import`, reads batch row transaction ids and links
 * confirmed reconciliations to their manual twins.
 */
export async function applyInvoicePaymentReconciliationsForBatch(
  supabase: SupabaseClient,
  input: {
    batchId: string;
    items: BatchInvoicePaymentReconcileItem[];
  },
): Promise<{ linked: number; error: string | null }> {
  if (input.items.length === 0) {
    return { linked: 0, error: null };
  }

  const sourceLines = input.items.map((item) => item.sourceLine);
  const { data: batchRows, error } = await supabase
    .from("import_batch_rows")
    .select("source_line, transaction_id, linked_transaction_id")
    .eq("batch_id", input.batchId)
    .in("source_line", sourceLines);

  if (error) {
    return { linked: 0, error: error.message };
  }

  const byLine = new Map(
    (batchRows ?? []).map((row) => [row.source_line as number, row]),
  );

  let linked = 0;

  for (const item of input.items) {
    const batchRow = byLine.get(item.sourceLine);
    if (!batchRow?.transaction_id || !batchRow.linked_transaction_id) {
      continue;
    }

    // Primary = source expense; linked = card income (map-import-row order).
    const importedSourceTransactionId = batchRow.transaction_id as string;
    const importedCardTransactionId = batchRow.linked_transaction_id as string;

    const result = await linkInvoicePaymentReconciliation(supabase, {
      importedCardTransactionId,
      manualCardTransactionId: item.manualCardTransactionId,
      importedSourceTransactionId,
      manualSourceTransactionId: item.manualSourceTransactionId ?? null,
    });

    if (result.ok) {
      linked += 1;
    }
  }

  return { linked, error: null };
}
