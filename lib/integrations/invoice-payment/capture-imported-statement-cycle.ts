import type { CreditCardBillingConfig } from "@/lib/finance/credit-card-billing";
import { addDaysIso, roundMoney } from "@/lib/finance/credit-card-billing";
import {
  buildImportedStatementCycleDraft,
  type CardStatementCycleUpsertInput,
} from "@/lib/finance/card-statement-cycles";
import {
  getInvoicePaymentImportMode,
  type InvoicePaymentImportMode,
} from "@/lib/integrations/invoice-payment/resolve-invoice-payment";
import {
  getInvoicePaymentCycleTargetSelection,
  isValidInvoicePaymentFileCycle,
  resolveInvoicePaymentCycleTarget,
  type InvoicePaymentCycleTargetSelection,
  type InvoicePaymentFileCycle,
} from "@/lib/integrations/invoice-payment/invoice-payment-cycle-target";
import {
  buildNubankStatementInvoiceBreakdown,
  type NubankStatementInvoiceBreakdown,
} from "@/lib/integrations/sources/nubank/statement-invoice";
import {
  classifyNubankStatementLine,
  type NubankStatementLineKind,
} from "@/lib/integrations/sources/nubank/statement-line-kind";
import type { ImportPreviewRow } from "@/lib/integrations/types";

function resolveRowLineKind(row: ImportPreviewRow): NubankStatementLineKind {
  const fromMeta = row.metadata?.nubankStatementLineKind;
  if (
    typeof fromMeta === "string" &&
    fromMeta.length > 0 &&
    fromMeta !== "UNKNOWN"
  ) {
    return fromMeta as NubankStatementLineKind;
  }
  const signed =
    row.direction === "in" ? -Math.abs(Number(row.amount)) : Math.abs(Number(row.amount));
  return classifyNubankStatementLine({
    title: row.description,
    amount: signed,
  });
}

/**
 * Preliminary issuer bill total from a Nubank CC CSV (typed breakdown).
 * Used as persisted `amount_due` / import-review "Total da fatura".
 *
 * Payments (`Pagamento recebido`) participate in the total:
 * - on/before previous due (or explicitly tagged to another due) → prior settlement
 * - after previous due → reduce this file's amountDue (early/current payments)
 */
export function buildCardStatementInvoiceBreakdownFromImportRows(
  rows: ImportPreviewRow[],
  invoicePaymentModes: Record<number, InvoicePaymentImportMode> = {},
  options?: {
    previousDueDate?: string | null;
    statementDueDay?: number | null;
    /** Due date of the statement file cycle being imported. */
    fileDueDate?: string | null;
    invoicePaymentCycleTargets?: Record<
      number,
      InvoicePaymentCycleTargetSelection
    >;
  },
): NubankStatementInvoiceBreakdown {
  const targets = options?.invoicePaymentCycleTargets ?? {};
  const fileDue = options?.fileDueDate?.slice(0, 10) ?? null;

  return buildNubankStatementInvoiceBreakdown({
    previousDueDate: options?.previousDueDate,
    statementDueDay: options?.statementDueDay,
    rows: rows.map((row) => {
      const mode = getInvoicePaymentImportMode(
        invoicePaymentModes,
        row.sourceLine,
      );
      const kind = resolveRowLineKind(row);
      // "common" invoice-payment rows behave as merchant credits for the total.
      const effectiveKind: NubankStatementLineKind =
        row.kind === "card_invoice_payment" && mode === "common"
          ? "CREDIT"
          : kind;

      const selection = getInvoicePaymentCycleTargetSelection(
        targets,
        row.sourceLine,
      );
      const targetDue = selection.targetDueDate?.slice(0, 10) ?? null;
      // Explicit tag to another due → never reduce this file's amountDue.
      const settlePriorBill =
        row.kind === "card_invoice_payment" &&
        mode === "payment" &&
        Boolean(targetDue) &&
        Boolean(fileDue) &&
        targetDue !== fileDue;

      return {
        date: row.date,
        description: row.description,
        amount:
          row.direction === "in"
            ? -Math.abs(Number(row.amount))
            : Math.abs(Number(row.amount)),
        kind: effectiveKind,
        include: row.historicalStatus === "new",
        settlePriorBill,
      };
    }),
  });
}

/**
 * Net bill total from a credit-card CSV via typed Nubank statement breakdown.
 */
export function sumCardStatementPurchasesFromImportRows(
  rows: ImportPreviewRow[],
  invoicePaymentModes: Record<number, InvoicePaymentImportMode> = {},
  options?: {
    previousDueDate?: string | null;
    statementDueDay?: number | null;
    fileDueDate?: string | null;
    invoicePaymentCycleTargets?: Record<
      number,
      InvoicePaymentCycleTargetSelection
    >;
  },
): number {
  return buildCardStatementInvoiceBreakdownFromImportRows(
    rows,
    invoicePaymentModes,
    options,
  ).amountDue;
}

/**
 * Previous-bill cutoff for payment splitting.
 * Prefer the earliest carried-balance line date in this CSV (Nubank posts
 * Saldo em atraso / pendente on the prior due). Else: day before period start.
 * Never uses card closing/due day settings.
 */
function resolvePreviousDueDateForFileCycle(
  fileCycle: InvoicePaymentFileCycle | null,
  rows: ImportPreviewRow[],
): string | null {
  let earliestCarried: string | null = null;
  for (const row of rows) {
    if (row.historicalStatus !== "new") continue;
    const kind = resolveRowLineKind(row);
    if (
      kind !== "PREVIOUS_BALANCE" &&
      kind !== "PENDING_PREVIOUS_MONTH" &&
      kind !== "REVOLVING_BALANCE"
    ) {
      continue;
    }
    const date = row.date.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (earliestCarried == null || date < earliestCarried) {
      earliestCarried = date;
    }
  }
  if (earliestCarried) return earliestCarried;

  if (!fileCycle?.periodStart) return null;
  return addDaysIso(fileCycle.periodStart.slice(0, 10), -1);
}

function buildPriorCycleEnrichmentUpserts(input: {
  rows: ImportPreviewRow[];
  billingConfig: CreditCardBillingConfig;
  accountId: string;
  ownerUserId: string;
  familyId?: string | null;
  importBatchId?: string | null;
  /**
   * Due dates the user already owns (file due + payment targets).
   * Enrichment may only lift amount_due on these — never invent a new due.
   */
  knownDueDates?: ReadonlySet<string>;
}): CardStatementCycleUpsertInput[] {
  const byClosing = new Map<string, CardStatementCycleUpsertInput>();
  const known = input.knownDueDates ?? new Set<string>();

  for (const row of input.rows) {
    if (row.historicalStatus !== "new") continue;

    const kind = resolveRowLineKind(row);
    if (
      kind !== "PREVIOUS_BALANCE" &&
      kind !== "PENDING_PREVIOUS_MONTH" &&
      kind !== "REVOLVING_BALANCE"
    ) {
      continue;
    }

    const amount = roundMoney(Math.abs(Number(row.amount)));
    if (!Number.isFinite(amount) || amount <= 0.005) continue;

    // Line date is often the prior bill's due — but only attach when that due
    // is already known (user-informed file due or payment target). Never mint
    // a ghost fatura (e.g. 30/06) from a carried-balance line alone.
    const dueDate = row.date.slice(0, 10);
    if (!known.has(dueDate)) {
      continue;
    }

    const closingDate = dueDate;
    const cycleDraft = buildImportedStatementCycleDraft({
      config: input.billingConfig,
      closingDate,
      dueDate,
      amountDue: amount,
      periodStart: dueDate,
      periodEnd: dueDate,
    });

    const existing = byClosing.get(cycleDraft.cycleId);
    const nextAmount =
      existing?.amountDue != null
        ? Math.max(Number(existing.amountDue), amount)
        : amount;

    byClosing.set(cycleDraft.cycleId, {
      accountId: input.accountId,
      ownerUserId: input.ownerUserId,
      familyId: input.familyId ?? null,
      closingDate: cycleDraft.closingDate,
      periodStart: cycleDraft.periodStart,
      periodEnd: cycleDraft.periodEnd,
      dueDate: cycleDraft.dueDate,
      amountDue: nextAmount,
      // N+1 carried balance confirms the prior bill's unpaid remainder.
      amountDueConfirmation: "confirmed",
      source: "imported",
      importBatchId: input.importBatchId ?? null,
      notes: `Restante confirmado pelo próximo extrato (${kind}) em ${dueDate}.`,
    });
  }

  return [...byClosing.values()];
}

/**
 * Builds persisted cycle upserts for confirmed invoice payments in a CC import.
 * Prefer explicit file closing/due; fall back to resolved target cycle dates.
 * The file cycle stores the CSV purchase total as issuer `amount_due`.
 */
export function buildImportedCardStatementCycleUpserts(input: {
  rows: ImportPreviewRow[];
  billingConfig: CreditCardBillingConfig;
  accountId: string;
  ownerUserId: string;
  familyId?: string | null;
  fileName?: string | null;
  fileCycle?: InvoicePaymentFileCycle | null;
  importBatchId?: string | null;
  invoicePaymentModes?: Record<number, InvoicePaymentImportMode>;
  invoicePaymentCycleTargets?: Record<
    number,
    InvoicePaymentCycleTargetSelection
  >;
  /** Optional override; defaults to summing purchase rows in `rows`. */
  fileAmountDue?: number | null;
  /**
   * Due dates already persisted for this card (from prior imports).
   * Used so N+1 "Saldo em atraso" can lift amount_due without inventing
   * dues the user never confirmed.
   */
  existingDueDates?: readonly string[];
  /** Persisted cycles — used to map prior due → real closing_date on confirm. */
  existingCycles?: ReadonlyArray<{
    dueDate: string;
    closingDate: string;
    periodStart: string;
    periodEnd: string;
    amountDue: number | null;
  }>;
}): CardStatementCycleUpsertInput[] {
  const modes = input.invoicePaymentModes ?? {};
  const targets = input.invoicePaymentCycleTargets ?? {};
  const fileCycle = isValidInvoicePaymentFileCycle(input.fileCycle)
    ? input.fileCycle
    : null;
  const byClosing = new Map<string, CardStatementCycleUpsertInput>();
  const previousDueDate = resolvePreviousDueDateForFileCycle(
    fileCycle,
    input.rows,
  );
  const fileAmountDue =
    input.fileAmountDue == null
      ? sumCardStatementPurchasesFromImportRows(input.rows, modes, {
          previousDueDate,
          fileDueDate: fileCycle?.dueDate ?? null,
          invoicePaymentCycleTargets: targets,
        })
      : roundMoney(Number(input.fileAmountDue));
  const trustedFileAmountDue =
    fileAmountDue > 0.005 ? fileAmountDue : null;

  for (const row of input.rows) {
    if (row.kind !== "card_invoice_payment") {
      continue;
    }
    if (row.historicalStatus !== "new") {
      continue;
    }
    if (getInvoicePaymentImportMode(modes, row.sourceLine) !== "payment") {
      continue;
    }

    const selection = getInvoicePaymentCycleTargetSelection(
      targets,
      row.sourceLine,
    );
    const resolved = resolveInvoicePaymentCycleTarget(
      input.billingConfig,
      row.date,
      selection,
      { fileCycle },
    );

    // When the chosen due matches the CSV file cycle, keep the file cycle.
    // Otherwise identity = due date (never invent a closing from card day).
    const fileDue = fileCycle?.dueDate.slice(0, 10) ?? null;
    const targetDue = selection.targetDueDate?.slice(0, 10) ?? null;
    const useFileCycle =
      Boolean(fileCycle) &&
      (targetDue === fileDue ||
        resolved.dueDate.slice(0, 10) === fileDue ||
        (selection.target === "previous" && !targetDue));

    const dueDate = useFileCycle ? fileDue! : resolved.dueDate.slice(0, 10);
    const closingDate = useFileCycle
      ? fileCycle!.closingDate.slice(0, 10)
      : dueDate;
    const periodStart = useFileCycle
      ? (fileCycle!.periodStart?.slice(0, 10) ?? dueDate)
      : (resolved.periodStart?.slice(0, 10) ?? dueDate);
    const periodEnd = useFileCycle
      ? (fileCycle!.periodEnd?.slice(0, 10) ?? dueDate)
      : (resolved.periodEnd?.slice(0, 10) ?? dueDate);

    const paymentAmount = roundMoney(Math.abs(Number(row.amount)));
    const isPostDueSettlement =
      !useFileCycle &&
      Number.isFinite(paymentAmount) &&
      paymentAmount > 0.005 &&
      row.date.slice(0, 10) >= dueDate;

    const draft = buildImportedStatementCycleDraft({
      config: input.billingConfig,
      closingDate,
      dueDate,
      amountDue: useFileCycle
        ? trustedFileAmountDue
        : isPostDueSettlement
          ? paymentAmount
          : null,
      periodStart,
      periodEnd,
    });

    const existing = byClosing.get(draft.cycleId);
    if (
      existing &&
      selection.target !== "previous" &&
      !selection.targetDueDate
    ) {
      continue;
    }

    const nextAmountDue = useFileCycle
      ? trustedFileAmountDue
      : isPostDueSettlement
        ? paymentAmount
        : null;

    byClosing.set(draft.cycleId, {
      accountId: input.accountId,
      ownerUserId: input.ownerUserId,
      familyId: input.familyId ?? null,
      closingDate: draft.closingDate,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      dueDate: draft.dueDate,
      amountDue:
        nextAmountDue != null && existing?.amountDue != null
          ? Math.max(nextAmountDue, Number(existing.amountDue))
          : (nextAmountDue ?? existing?.amountDue ?? null),
      // File cycle stays provisional until the next CSV confirms remainder.
      amountDueConfirmation: useFileCycle
        ? "provisional"
        : (existing?.amountDueConfirmation ?? "provisional"),
      source: "imported",
      importBatchId: input.importBatchId ?? null,
      notes: fileCycle
        ? `Ciclo capturado na importação (período ${fileCycle.periodStart ?? "?"}–${fileCycle.periodEnd ?? "?"}, vencimento ${fileCycle.dueDate}).`
        : "Ciclo capturado na importação a partir do pagamento de fatura.",
    });
  }

  // Persist the file cycle when no payment already covers that due date.
  if (fileCycle) {
    const fileDraft = buildImportedStatementCycleDraft({
      config: input.billingConfig,
      closingDate: fileCycle.closingDate,
      dueDate: fileCycle.dueDate,
      amountDue: trustedFileAmountDue,
      periodStart: fileCycle.periodStart,
      periodEnd: fileCycle.periodEnd,
    });
    const fileDue = fileCycle.dueDate.slice(0, 10);
    const hasCycleForSameDue = [...byClosing.values()].some(
      (cycle) => cycle.dueDate.slice(0, 10) === fileDue,
    );

    const fileNotes = `Ciclo do arquivo (período ${fileCycle.periodStart ?? "?"}–${fileCycle.periodEnd ?? "?"}, vencimento ${fileCycle.dueDate}). Total provisório até o próximo extrato.`;

    if (byClosing.has(fileDraft.cycleId)) {
      const existing = byClosing.get(fileDraft.cycleId)!;
      byClosing.set(fileDraft.cycleId, {
        ...existing,
        dueDate: fileDue,
        periodStart:
          fileCycle.periodStart?.slice(0, 10) ?? existing.periodStart,
        periodEnd: fileCycle.periodEnd?.slice(0, 10) ?? existing.periodEnd,
        amountDue: trustedFileAmountDue ?? existing.amountDue ?? null,
        amountDueConfirmation: "provisional",
        notes: fileNotes,
      });
    } else if (!hasCycleForSameDue) {
      byClosing.set(fileDraft.cycleId, {
        accountId: input.accountId,
        ownerUserId: input.ownerUserId,
        familyId: input.familyId ?? null,
        closingDate: fileDraft.closingDate,
        periodStart: fileDraft.periodStart,
        periodEnd: fileDraft.periodEnd,
        dueDate: fileDraft.dueDate,
        amountDue: trustedFileAmountDue,
        amountDueConfirmation: "provisional",
        source: "imported",
        importBatchId: input.importBatchId ?? null,
        notes: fileNotes,
      });
    } else {
      for (const [closing, cycle] of byClosing) {
        if (cycle.dueDate.slice(0, 10) !== fileDue) {
          continue;
        }
        byClosing.set(closing, {
          ...cycle,
          amountDue: trustedFileAmountDue ?? cycle.amountDue ?? null,
          amountDueConfirmation: "provisional",
          periodStart:
            fileCycle.periodStart?.slice(0, 10) ?? cycle.periodStart,
          periodEnd: fileCycle.periodEnd?.slice(0, 10) ?? cycle.periodEnd,
          notes: fileNotes,
        });
      }
    }
  }

  const existingByDue = new Map<
    string,
    {
      dueDate: string;
      closingDate: string;
      periodStart: string;
      periodEnd: string;
      amountDue: number | null;
    }
  >();
  for (const cycle of input.existingCycles ?? []) {
    const due = cycle.dueDate.slice(0, 10);
    if (!existingByDue.has(due)) {
      existingByDue.set(due, {
        dueDate: due,
        closingDate: cycle.closingDate.slice(0, 10),
        periodStart: cycle.periodStart.slice(0, 10),
        periodEnd: cycle.periodEnd.slice(0, 10),
        amountDue: cycle.amountDue,
      });
    }
  }
  for (const due of input.existingDueDates ?? []) {
    if (due && !existingByDue.has(due.slice(0, 10))) {
      // Due known without full cycle row — identity falls back to due date.
      existingByDue.set(due.slice(0, 10), {
        dueDate: due.slice(0, 10),
        closingDate: due.slice(0, 10),
        periodStart: due.slice(0, 10),
        periodEnd: due.slice(0, 10),
        amountDue: null,
      });
    }
  }

  const fileDueForEnrich = fileCycle?.dueDate.slice(0, 10) ?? null;
  const knownDueDates = new Set<string>([...existingByDue.keys()]);
  for (const cycle of byClosing.values()) {
    knownDueDates.add(cycle.dueDate.slice(0, 10));
  }
  for (const selection of Object.values(targets)) {
    const targetDue = selection.targetDueDate?.slice(0, 10);
    if (targetDue) knownDueDates.add(targetDue);
  }
  if (fileDueForEnrich) {
    knownDueDates.delete(fileDueForEnrich);
  }

  const confirmedPriorDues = new Set<string>();

  for (const enrichment of buildPriorCycleEnrichmentUpserts({
    rows: input.rows,
    billingConfig: input.billingConfig,
    accountId: input.accountId,
    ownerUserId: input.ownerUserId,
    familyId: input.familyId,
    importBatchId: input.importBatchId,
    knownDueDates,
  })) {
    const due = enrichment.dueDate.slice(0, 10);
    confirmedPriorDues.add(due);
    const persisted = existingByDue.get(due);
    const closingKey = persisted?.closingDate ?? enrichment.closingDate;
    const aligned: CardStatementCycleUpsertInput = {
      ...enrichment,
      closingDate: closingKey,
      periodStart: persisted?.periodStart ?? enrichment.periodStart,
      periodEnd: persisted?.periodEnd ?? enrichment.periodEnd,
    };
    const existing = byClosing.get(closingKey);
    if (!existing) {
      byClosing.set(closingKey, aligned);
      continue;
    }
    const existingDue =
      existing.amountDue == null ? null : Number(existing.amountDue);
    const enrichDue =
      aligned.amountDue == null ? null : Number(aligned.amountDue);
    byClosing.set(closingKey, {
      ...existing,
      amountDue:
        existingDue != null && enrichDue != null
          ? Math.max(existingDue, enrichDue)
          : (enrichDue ?? existingDue),
      amountDueConfirmation: "confirmed",
      notes: aligned.notes ?? existing.notes,
    });
  }

  // No carried balance targeting a known prior due → that prior was settled.
  // Prefer the latest persisted due before this file's due (not periodStart−1).
  const priorDueToConfirm =
    fileDueForEnrich == null
      ? null
      : [...knownDueDates]
          .filter((due) => due < fileDueForEnrich)
          .sort((left, right) => right.localeCompare(left))[0] ?? null;

  const hasAnyCarriedForKnownPriors = confirmedPriorDues.size > 0;

  if (
    priorDueToConfirm &&
    !hasAnyCarriedForKnownPriors &&
    existingByDue.has(priorDueToConfirm)
  ) {
    const persisted = existingByDue.get(priorDueToConfirm)!;
    const closingKey = persisted.closingDate;
    const existing = byClosing.get(closingKey);
    if (existing) {
      byClosing.set(closingKey, {
        ...existing,
        amountDueConfirmation: "confirmed",
        notes:
          existing.notes ??
          `Sem saldo carregado no próximo extrato — restante do vencimento ${priorDueToConfirm} confirmado como quitado.`,
      });
    } else {
      byClosing.set(closingKey, {
        accountId: input.accountId,
        ownerUserId: input.ownerUserId,
        familyId: input.familyId ?? null,
        closingDate: closingKey,
        periodStart: persisted.periodStart,
        periodEnd: persisted.periodEnd,
        dueDate: priorDueToConfirm,
        amountDue: persisted.amountDue,
        amountDueConfirmation: "confirmed",
        source: "imported",
        importBatchId: input.importBatchId ?? null,
        notes: `Sem saldo carregado no próximo extrato — restante do vencimento ${priorDueToConfirm} confirmado como quitado.`,
      });
    }
  }

  return [...byClosing.values()];
}
