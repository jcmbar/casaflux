import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildStatementCycle,
  compareIsoDates,
  type CreditCardBillingConfig,
  type StatementCycle,
} from "@/lib/finance/credit-card-billing";

export type CardStatementCycleSource = "imported" | "manual" | "derived";

export type CardStatementCycleRecord = {
  id: string;
  accountId: string;
  ownerUserId: string;
  familyId: string | null;
  closingDate: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountDue: number | null;
  source: CardStatementCycleSource;
  importBatchId: string | null;
  notes: string | null;
};

export type CardStatementCycleUpsertInput = {
  accountId: string;
  ownerUserId: string;
  familyId?: string | null;
  closingDate: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountDue?: number | null;
  source: Exclude<CardStatementCycleSource, "derived">;
  importBatchId?: string | null;
  notes?: string | null;
};

type CardStatementCycleRow = {
  id: string;
  account_id: string;
  owner_user_id: string;
  family_id: string | null;
  closing_date: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_due: number | string | null;
  source: CardStatementCycleSource;
  import_batch_id: string | null;
  notes: string | null;
};

export function mapCardStatementCycleRow(
  row: CardStatementCycleRow,
): CardStatementCycleRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    ownerUserId: row.owner_user_id,
    familyId: row.family_id,
    closingDate: row.closing_date.slice(0, 10),
    periodStart: row.period_start.slice(0, 10),
    periodEnd: row.period_end.slice(0, 10),
    dueDate: row.due_date.slice(0, 10),
    amountDue:
      row.amount_due == null || row.amount_due === ""
        ? null
        : Number(row.amount_due),
    source: row.source,
    importBatchId: row.import_batch_id,
    notes: row.notes,
  };
}

export function cardStatementCycleRecordToStatementCycle(
  record: CardStatementCycleRecord,
): StatementCycle {
  return {
    cycleId: record.closingDate,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    closingDate: record.closingDate,
    dueDate: record.dueDate,
    source: record.source,
    issuerAmountDue: record.amountDue,
  };
}

/**
 * Parses due-date hints from common Nubank export filenames, e.g.
 * `Nubank_2026-08-01.csv` → `2026-08-01`.
 */
export function parseStatementDueDateFromFileName(
  fileName: string | null | undefined,
): string | null {
  if (!fileName) {
    return null;
  }

  const match = fileName.match(/(20\d{2}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function buildImportedStatementCycleDraft(input: {
  config: CreditCardBillingConfig;
  closingDate: string;
  dueDate?: string | null;
  amountDue?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}): StatementCycle {
  const synthetic = buildStatementCycle({
    closingDate: input.closingDate.slice(0, 10),
    closingDay: input.config.statementClosingDay,
    dueDay: input.config.statementDueDay,
  });

  return {
    ...synthetic,
    periodStart: input.periodStart?.slice(0, 10) ?? synthetic.periodStart,
    periodEnd: input.periodEnd?.slice(0, 10) ?? synthetic.periodEnd,
    dueDate: input.dueDate?.slice(0, 10) ?? synthetic.dueDate,
    source: "imported",
    issuerAmountDue:
      input.amountDue == null ? null : Number(input.amountDue),
  };
}

/**
 * Infer closing/due day fallbacks from the newest persisted invoice.
 * Used when the card has no statement_*_day configured yet.
 */
export function inferCreditCardBillingConfigFromInvoices(
  invoices: CardStatementCycleRecord[],
): CreditCardBillingConfig | null {
  if (invoices.length === 0) {
    return null;
  }

  const newest = [...invoices].sort((left, right) =>
    compareIsoDates(right.closingDate, left.closingDate),
  )[0]!;

  const closingDay = Number(newest.closingDate.slice(8, 10));
  const dueDay = Number(newest.dueDate.slice(8, 10));
  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
    return null;
  }
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    return null;
  }

  return {
    statementClosingDay: closingDay,
    statementDueDay: dueDay,
  };
}

/**
 * Prefer the due day-of-month from the newest imported/manual cycle when the
 * card's configured statement_due_day disagrees with real issuer dues.
 */
export function resolveStatementDueDayFromImported(
  config: CreditCardBillingConfig,
  importedCycles: CardStatementCycleRecord[],
): number {
  const sorted = [...importedCycles].sort((left, right) =>
    compareIsoDates(right.closingDate, left.closingDate),
  );

  for (const record of sorted) {
    const day = Number(record.dueDate.slice(8, 10));
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      return day;
    }
  }

  return config.statementDueDay;
}

/**
 * When several imported cycles share the same due date (e.g. "Ciclo do arquivo"
 * closing 04-24 plus payment-captured closing 04-25), keep a single bill.
 * Prefer: issuer amount_due → closing with payment link → latest closing.
 * Merge issuer total from dropped siblings onto the winner when needed.
 */
export function pruneRedundantImportedStatementCycles(input: {
  cycles: StatementCycle[];
  cycleIdsWithPayments: ReadonlySet<string>;
  /** Due dates that already have a linked payment (due-first). */
  dueDatesWithPayments?: ReadonlySet<string>;
}): StatementCycle[] {
  const byDue = new Map<string, StatementCycle[]>();

  for (const cycle of input.cycles) {
    if (cycle.source !== "imported" && cycle.source !== "manual") {
      continue;
    }
    const due = cycle.dueDate.slice(0, 10);
    const group = byDue.get(due) ?? [];
    group.push(cycle);
    byDue.set(due, group);
  }

  const drop = new Set<string>();
  const mergedById = new Map<string, StatementCycle>();

  for (const group of byDue.values()) {
    if (group.length < 2) {
      continue;
    }

    const ranked = [...group].sort((left, right) => {
      const leftIssuer =
        left.issuerAmountDue != null && left.issuerAmountDue > 0 ? 1 : 0;
      const rightIssuer =
        right.issuerAmountDue != null && right.issuerAmountDue > 0 ? 1 : 0;
      if (leftIssuer !== rightIssuer) {
        return rightIssuer - leftIssuer;
      }

      const leftClosingPay = input.cycleIdsWithPayments.has(left.cycleId)
        ? 1
        : 0;
      const rightClosingPay = input.cycleIdsWithPayments.has(right.cycleId)
        ? 1
        : 0;
      if (leftClosingPay !== rightClosingPay) {
        return rightClosingPay - leftClosingPay;
      }

      return compareIsoDates(right.closingDate, left.closingDate);
    });

    const preferred = { ...ranked[0]! };
    for (const sibling of ranked.slice(1)) {
      drop.add(sibling.cycleId);
      if (
        (preferred.issuerAmountDue == null ||
          preferred.issuerAmountDue <= 0) &&
        sibling.issuerAmountDue != null &&
        sibling.issuerAmountDue > 0
      ) {
        preferred.issuerAmountDue = sibling.issuerAmountDue;
      }
    }
    mergedById.set(preferred.cycleId, preferred);
  }

  if (drop.size === 0 && mergedById.size === 0) {
    return input.cycles;
  }

  return input.cycles
    .filter((cycle) => !drop.has(cycle.cycleId))
    .map((cycle) => mergedById.get(cycle.cycleId) ?? cycle);
}

/**
 * Drop derived open-bill fallbacks when an imported/manual invoice already
 * covers the same due date (avoids twin rows like 07-20 imported + 07-25 derived).
 */
export function collapseDerivedCyclesWithImportedDue(
  cycles: StatementCycle[],
): StatementCycle[] {
  const importedDues = new Set(
    cycles
      .filter(
        (cycle) => cycle.source === "imported" || cycle.source === "manual",
      )
      .map((cycle) => cycle.dueDate.slice(0, 10)),
  );

  if (importedDues.size === 0) {
    return cycles;
  }

  return cycles.filter((cycle) => {
    if (cycle.source !== "derived") {
      return true;
    }
    return !importedDues.has(cycle.dueDate.slice(0, 10));
  });
}

/**
 * Prefer persisted imported/manual cycles over synthetic closing/due-day math.
 */
export function mergeStatementCyclesWithImported(input: {
  derivedCycles: StatementCycle[];
  importedCycles: CardStatementCycleRecord[];
}): StatementCycle[] {
  const byClosing = new Map<string, StatementCycle>();

  for (const cycle of input.derivedCycles) {
    byClosing.set(cycle.cycleId, { ...cycle, source: cycle.source ?? "derived" });
  }

  for (const record of input.importedCycles) {
    const imported = cardStatementCycleRecordToStatementCycle(record);
    const existing = byClosing.get(imported.cycleId);
    if (!existing || existing.source === "derived") {
      byClosing.set(imported.cycleId, imported);
      continue;
    }

    // Keep richer imported/manual metadata; fill gaps from derived.
    byClosing.set(imported.cycleId, {
      ...existing,
      ...imported,
      issuerAmountDue:
        imported.issuerAmountDue ?? existing.issuerAmountDue ?? null,
    });
  }

  return collapseDerivedCyclesWithImportedDue(
    [...byClosing.values()].sort((left, right) =>
      compareIsoDates(right.closingDate, left.closingDate),
    ),
  );
}

export async function fetchCardStatementCyclesForAccount(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{
  cycles: CardStatementCycleRecord[];
  errorMessage: string | null;
}> {
  const { data, error } = await supabase
    .from("card_statement_cycles")
    .select(
      "id, account_id, owner_user_id, family_id, closing_date, period_start, period_end, due_date, amount_due, source, import_batch_id, notes",
    )
    .eq("account_id", accountId)
    .order("closing_date", { ascending: false });

  if (error) {
    return { cycles: [], errorMessage: error.message };
  }

  return {
    cycles: ((data ?? []) as CardStatementCycleRow[]).map(
      mapCardStatementCycleRow,
    ),
    errorMessage: null,
  };
}

/**
 * Merge rules when a later import touches an existing invoice cycle:
 * - Keep the original `import_batch_id` so rolling back the new batch cannot
 *   cascade-delete a consolidated invoice owned by an earlier import.
 * - Keep a trusted `amount_due` when the incoming payload omits/nulls it.
 * - Prefer a new non-null issuer total from the file when provided.
 */
export function mergeCardStatementCycleUpsertWithExisting(input: {
  incoming: CardStatementCycleUpsertInput;
  existing: Pick<
    CardStatementCycleRecord,
    "importBatchId" | "amountDue" | "notes"
  > | null;
}): {
  amountDue: number | null;
  importBatchId: string | null;
  notes: string | null;
} {
  const incomingAmount =
    input.incoming.amountDue == null
      ? null
      : Number(input.incoming.amountDue);
  const existingAmount =
    input.existing?.amountDue == null
      ? null
      : Number(input.existing.amountDue);

  return {
    amountDue:
      incomingAmount != null && Number.isFinite(incomingAmount)
        ? incomingAmount
        : existingAmount,
    importBatchId:
      input.existing?.importBatchId ?? input.incoming.importBatchId ?? null,
    notes: input.incoming.notes ?? input.existing?.notes ?? null,
  };
}

export async function upsertCardStatementCycle(
  supabase: SupabaseClient,
  input: CardStatementCycleUpsertInput,
): Promise<{ ok: true; cycle: CardStatementCycleRecord } | { ok: false; message: string }> {
  const closingDate = input.closingDate.slice(0, 10);

  const { data: existingRow, error: existingError } = await supabase
    .from("card_statement_cycles")
    .select("id, import_batch_id, amount_due, notes")
    .eq("account_id", input.accountId)
    .eq("closing_date", closingDate)
    .maybeSingle();

  if (existingError) {
    return { ok: false, message: existingError.message };
  }

  const existing = existingRow
    ? {
        importBatchId: (existingRow.import_batch_id as string | null) ?? null,
        amountDue:
          existingRow.amount_due == null || existingRow.amount_due === ""
            ? null
            : Number(existingRow.amount_due),
        notes: (existingRow.notes as string | null) ?? null,
      }
    : null;

  const merged = mergeCardStatementCycleUpsertWithExisting({
    incoming: input,
    existing,
  });

  const payload = {
    account_id: input.accountId,
    owner_user_id: input.ownerUserId,
    family_id: input.familyId ?? null,
    closing_date: closingDate,
    period_start: input.periodStart.slice(0, 10),
    period_end: input.periodEnd.slice(0, 10),
    due_date: input.dueDate.slice(0, 10),
    amount_due: merged.amountDue,
    source: input.source,
    import_batch_id: merged.importBatchId,
    notes: merged.notes,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("card_statement_cycles")
    .upsert(payload, { onConflict: "account_id,closing_date" })
    .select(
      "id, account_id, owner_user_id, family_id, closing_date, period_start, period_end, due_date, amount_due, source, import_batch_id, notes",
    )
    .single();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "Falha ao salvar ciclo." };
  }

  return {
    ok: true,
    cycle: mapCardStatementCycleRow(data as CardStatementCycleRow),
  };
}

export type InvoicePaymentAmountFeedbackKind =
  | "mismatch"
  | "no_invoice";

export type InvoicePaymentAmountFeedback = {
  kind: InvoicePaymentAmountFeedbackKind;
  paymentAmount: number;
  /** Real invoice total when kind === "mismatch"; null when no invoice found. */
  expectedAmountDue: number | null;
  difference: number | null;
  message: string;
};

/** @deprecated Prefer InvoicePaymentAmountFeedback. */
export type InvoicePaymentAmountDivergence = InvoicePaymentAmountFeedback & {
  amountBasis: "imported";
};

function formatBrl(amount: number): string {
  return amount.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Compare a payment to a **real** invoice total (from import/file).
 * Returns null when amounts match within tolerance.
 * Does not use cycle-derived estimates — callers must pass issuer/imported totals only.
 */
export function detectInvoicePaymentAmountDivergence(input: {
  paymentAmount: number;
  expectedAmountDue: number;
  /** Due date label for the selected bill, e.g. "04/05/2026". */
  dueDateLabel?: string | null;
  tolerance?: number;
}): InvoicePaymentAmountFeedback | null {
  const paymentAmount = Math.abs(Number(input.paymentAmount));
  const expectedAmountDue = Math.max(0, Number(input.expectedAmountDue));
  const tolerance = input.tolerance ?? 0.05;
  const difference =
    Math.round((paymentAmount - expectedAmountDue) * 100) / 100;

  if (Math.abs(difference) <= tolerance) {
    return null;
  }

  const paymentLabel = formatBrl(paymentAmount);
  const expectedLabel = formatBrl(expectedAmountDue);
  const dueClause = input.dueDateLabel
    ? `com vencimento em ${input.dueDateLabel}`
    : "selecionada";

  const headline =
    difference > 0
      ? "Pagamento maior que a fatura selecionada."
      : "Pagamento menor que a fatura selecionada.";

  const message = `${headline} Este pagamento é de ${paymentLabel}, mas a fatura ${dueClause} tem total de ${expectedLabel}. Verifique se a fatura escolhida está correta.`;

  return {
    kind: "mismatch",
    paymentAmount,
    expectedAmountDue,
    difference,
    message,
  };
}

/**
 * Informational feedback when the selected due date has no imported invoice
 * with a known total — do not invent a cycle-based estimate for comparison.
 */
export function buildInvoicePaymentMissingInvoiceFeedback(input: {
  paymentAmount: number;
  dueDateLabel?: string | null;
}): InvoicePaymentAmountFeedback {
  const paymentAmount = Math.abs(Number(input.paymentAmount));
  const paymentLabel = formatBrl(paymentAmount);
  const dueLabel = input.dueDateLabel?.trim() || null;

  const dueClause = dueLabel
    ? `com vencimento em ${dueLabel}`
    : "com o vencimento informado";

  return {
    kind: "no_invoice",
    paymentAmount,
    expectedAmountDue: null,
    difference: null,
    message: `Não encontramos uma fatura ${dueClause} no sistema. Este crédito de ${paymentLabel} será tratado como pagamento total/manual para esse vencimento.`,
  };
}
