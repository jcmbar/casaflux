import type { CreditCardBillingConfig } from "@/lib/finance/credit-card-billing";
import {
  addMonths,
  getClosingDateInMonth,
  getDueDateForClosingDate,
  getPreviousClosingDate,
  parseIsoDate,
  roundMoney,
} from "@/lib/finance/credit-card-billing";
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

function resolvePreviousDueDateForFileCycle(
  billingConfig: CreditCardBillingConfig,
  fileCycle: InvoicePaymentFileCycle | null,
): string | null {
  if (!fileCycle) return null;
  const previousClosing = getPreviousClosingDate(
    fileCycle.closingDate.slice(0, 10),
    billingConfig.statementClosingDay,
  );
  return getDueDateForClosingDate(
    previousClosing,
    billingConfig.statementDueDay,
  );
}

function buildPriorCycleEnrichmentUpserts(input: {
  rows: ImportPreviewRow[];
  billingConfig: CreditCardBillingConfig;
  accountId: string;
  ownerUserId: string;
  familyId?: string | null;
  importBatchId?: string | null;
}): CardStatementCycleUpsertInput[] {
  const byClosing = new Map<string, CardStatementCycleUpsertInput>();

  for (const row of input.rows) {
    if (row.historicalStatus !== "new") continue;

    const kind = resolveRowLineKind(row);
    if (kind !== "PREVIOUS_BALANCE" && kind !== "PENDING_PREVIOUS_MONTH") {
      continue;
    }

    const amount = roundMoney(Math.abs(Number(row.amount)));
    if (!Number.isFinite(amount) || amount <= 0.005) continue;

    // Carried line date is typically the prior bill's due date.
    const dueDate = row.date.slice(0, 10);
    const closingDate =
      resolveClosingForDueDate(input.billingConfig, dueDate) ?? dueDate;
    const cycleDraft = buildImportedStatementCycleDraft({
      config: input.billingConfig,
      closingDate,
      dueDate,
      amountDue: amount,
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
      source: "imported",
      importBatchId: input.importBatchId ?? null,
      notes: `Valor carregado do extrato (${kind}) em ${dueDate}.`,
    });
  }

  return [...byClosing.values()];
}

function resolveClosingForDueDate(
  config: CreditCardBillingConfig,
  dueDate: string,
): string | null {
  const due = dueDate.slice(0, 10);
  const { year, monthIndex } = parseIsoDate(due);

  for (let offset = 0; offset <= 3; offset += 1) {
    const month = addMonths(year, monthIndex, -offset);
    const closing = getClosingDateInMonth(
      month.year,
      month.monthIndex,
      config.statementClosingDay,
    );
    if (
      getDueDateForClosingDate(closing, config.statementDueDay) === due
    ) {
      return closing;
    }
  }
  return null;
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
}): CardStatementCycleUpsertInput[] {
  const modes = input.invoicePaymentModes ?? {};
  const targets = input.invoicePaymentCycleTargets ?? {};
  const fileCycle = isValidInvoicePaymentFileCycle(input.fileCycle)
    ? input.fileCycle
    : null;
  const byClosing = new Map<string, CardStatementCycleUpsertInput>();
  const previousDueDate = resolvePreviousDueDateForFileCycle(
    input.billingConfig,
    fileCycle,
  );
  const fileAmountDue =
    input.fileAmountDue == null
      ? sumCardStatementPurchasesFromImportRows(input.rows, modes, {
          previousDueDate,
          statementDueDay: input.billingConfig.statementDueDay,
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

    // When the chosen due matches the CSV file cycle, keep the real file
    // closing — do not invent a sibling closing from statement_closing_day.
    const fileDue = fileCycle?.dueDate.slice(0, 10) ?? null;
    const targetDue = selection.targetDueDate?.slice(0, 10) ?? null;
    const useFileClosing =
      Boolean(fileCycle) &&
      (targetDue === fileDue ||
        resolved.dueDate.slice(0, 10) === fileDue ||
        (selection.target === "previous" && !targetDue));

    const closingDate = useFileClosing
      ? fileCycle!.closingDate.slice(0, 10)
      : resolved.cycleId;
    const dueDate = useFileClosing ? fileDue! : resolved.dueDate;
    const periodStart = useFileClosing
      ? (fileCycle!.periodStart?.slice(0, 10) ?? resolved.periodStart)
      : resolved.periodStart;
    const periodEnd = useFileClosing
      ? (fileCycle!.periodEnd?.slice(0, 10) ??
        fileCycle!.closingDate.slice(0, 10))
      : resolved.periodEnd;

    const paymentAmount = roundMoney(Math.abs(Number(row.amount)));
    const isPostClosingSettlement =
      !useFileClosing &&
      Number.isFinite(paymentAmount) &&
      paymentAmount > 0.005 &&
      row.date.slice(0, 10) > closingDate;

    const draft = buildImportedStatementCycleDraft({
      config: input.billingConfig,
      closingDate,
      dueDate,
      // File cycle keeps CSV purchase net. A payment tagged to another due
      // after that bill's closing can lift amount_due to the settled total
      // (Nubank bill the user actually paid).
      amountDue: useFileClosing
        ? trustedFileAmountDue
        : isPostClosingSettlement
          ? paymentAmount
          : null,
      periodStart,
      periodEnd,
    });

    // Prefer "previous" / due-targeted payments as the source of truth for
    // cycle dates when multiple payments land in the same batch for the same closing.
    const existing = byClosing.get(draft.cycleId);
    if (
      existing &&
      selection.target !== "previous" &&
      !selection.targetDueDate
    ) {
      continue;
    }

    const nextAmountDue = useFileClosing
      ? trustedFileAmountDue
      : isPostClosingSettlement
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
      source: "imported",
      importBatchId: input.importBatchId ?? null,
      notes: fileCycle
        ? `Ciclo capturado na importação (fechamento ${fileCycle.closingDate}, vencimento ${fileCycle.dueDate}).`
        : "Ciclo capturado na importação a partir do pagamento de fatura.",
    });
  }

  // Persist the file cycle when no payment already covers that due date.
  // Avoid a sibling "Ciclo do arquivo" row (e.g. 04-24) next to a payment
  // cycle for the same vencimento (e.g. 04-25).
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

    if (byClosing.has(fileDraft.cycleId)) {
      const existing = byClosing.get(fileDraft.cycleId)!;
      byClosing.set(fileDraft.cycleId, {
        ...existing,
        dueDate: fileDue,
        periodStart:
          fileCycle.periodStart?.slice(0, 10) ?? existing.periodStart,
        periodEnd: fileCycle.periodEnd?.slice(0, 10) ?? existing.periodEnd,
        amountDue: trustedFileAmountDue ?? existing.amountDue ?? null,
        notes: `Ciclo do arquivo (fechamento ${fileCycle.closingDate}, vencimento ${fileCycle.dueDate}).`,
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
        source: "imported",
        importBatchId: input.importBatchId ?? null,
        notes: `Ciclo do arquivo (fechamento ${fileCycle.closingDate}, vencimento ${fileCycle.dueDate}).`,
      });
    } else {
      // Payment already created a cycle for this due — attach the file total
      // onto that bill so /faturas can use issuerAmountDue.
      for (const [closing, cycle] of byClosing) {
        if (cycle.dueDate.slice(0, 10) !== fileDue) {
          continue;
        }
        byClosing.set(closing, {
          ...cycle,
          amountDue: trustedFileAmountDue ?? cycle.amountDue ?? null,
          periodStart:
            fileCycle.periodStart?.slice(0, 10) ?? cycle.periodStart,
          periodEnd: fileCycle.periodEnd?.slice(0, 10) ?? cycle.periodEnd,
          notes: `Ciclo do arquivo (fechamento ${fileCycle.closingDate}, vencimento ${fileCycle.dueDate}).`,
        });
      }
    }
  }

  // Enrich prior cycles from carried-balance lines (Saldo em atraso / pendente).
  for (const enrichment of buildPriorCycleEnrichmentUpserts({
    rows: input.rows,
    billingConfig: input.billingConfig,
    accountId: input.accountId,
    ownerUserId: input.ownerUserId,
    familyId: input.familyId,
    importBatchId: input.importBatchId,
  })) {
    const existing = byClosing.get(enrichment.closingDate);
    if (!existing) {
      byClosing.set(enrichment.closingDate, enrichment);
      continue;
    }
    const existingDue =
      existing.amountDue == null ? null : Number(existing.amountDue);
    const enrichDue =
      enrichment.amountDue == null ? null : Number(enrichment.amountDue);
    byClosing.set(enrichment.closingDate, {
      ...existing,
      amountDue:
        existingDue != null && enrichDue != null
          ? Math.max(existingDue, enrichDue)
          : (enrichDue ?? existingDue),
      notes: enrichment.notes ?? existing.notes,
    });
  }

  return [...byClosing.values()];
}
