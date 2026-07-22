import type { CreditCardBillingConfig } from "@/lib/finance/credit-card-billing";
import { roundMoney } from "@/lib/finance/credit-card-billing";
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
import type { ImportPreviewRow } from "@/lib/integrations/types";

/**
 * Net bill total from a credit-card CSV: purchases (out) minus non-payment
 * credits/estornos (in). Invoice-payment rows are excluded.
 * Used as the persisted issuer `amount_due` for the imported statement file.
 */
export function sumCardStatementPurchasesFromImportRows(
  rows: ImportPreviewRow[],
  invoicePaymentModes: Record<number, InvoicePaymentImportMode> = {},
): number {
  let total = 0;

  for (const row of rows) {
    if (row.historicalStatus !== "new") {
      continue;
    }

    if (
      row.kind === "card_invoice_payment" &&
      getInvoicePaymentImportMode(invoicePaymentModes, row.sourceLine) ===
        "payment"
    ) {
      continue;
    }

    const amount = Math.abs(Number(row.amount));
    if (!Number.isFinite(amount)) {
      continue;
    }

    // Nubank CC: purchases/fees are "out"; estornos/credits are "in".
    if (row.direction === "out") {
      total += amount;
      continue;
    }

    if (row.direction === "in") {
      total -= amount;
    }
  }

  return roundMoney(Math.max(0, total));
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
  const fileAmountDue =
    input.fileAmountDue == null
      ? sumCardStatementPurchasesFromImportRows(input.rows, modes)
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

    const draft = buildImportedStatementCycleDraft({
      config: input.billingConfig,
      closingDate,
      dueDate,
      // Payment amount is never the bill total. File total only when this
      // closing is the imported statement itself.
      amountDue: useFileClosing ? trustedFileAmountDue : null,
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

    byClosing.set(draft.cycleId, {
      accountId: input.accountId,
      ownerUserId: input.ownerUserId,
      familyId: input.familyId ?? null,
      closingDate: draft.closingDate,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      dueDate: draft.dueDate,
      amountDue: useFileClosing ? trustedFileAmountDue : null,
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

  return [...byClosing.values()];
}
