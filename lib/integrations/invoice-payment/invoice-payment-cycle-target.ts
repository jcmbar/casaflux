import {
  addMonths,
  buildStatementCycle,
  formatFullBrDate,
  formatStatementPeriodLabel,
  getClosingDateInMonth,
  getCurrentStatementCycle,
  getStatementCyclePaidByPaymentDate,
  parseIsoDate,
  type CreditCardBillingConfig,
  type StatementCycle,
} from "@/lib/finance/credit-card-billing";

export type InvoicePaymentCycleTarget = "previous" | "current" | "future";

export type InvoicePaymentCycleTargetSelection = {
  target: InvoicePaymentCycleTarget;
  /** Closing-date ISO when target is "future". */
  futureCycleId?: string;
};

export type InvoicePaymentCycleTargetOption = {
  target: InvoicePaymentCycleTarget;
  label: string;
  hint: string;
  cycleId: string;
  periodLabel: string;
  dueDateLabel: string;
  recommended: boolean;
};

export type InvoicePaymentFutureCycleOption = {
  cycleId: string;
  periodLabel: string;
  dueDateLabel: string;
};

export function getDefaultInvoicePaymentCycleTargetSelection(): InvoicePaymentCycleTargetSelection {
  return { target: "previous" };
}

export function getInvoicePaymentCycleTargetSelection(
  selections: Record<number, InvoicePaymentCycleTargetSelection>,
  sourceLine: number,
): InvoicePaymentCycleTargetSelection {
  return selections[sourceLine] ?? getDefaultInvoicePaymentCycleTargetSelection();
}

export function parseInvoicePaymentCycleTargetValue(
  value: string,
): InvoicePaymentCycleTarget | null {
  if (value === "previous" || value === "current" || value === "future") {
    return value;
  }

  return null;
}

export function isInvoicePaymentCycleTargetChecked(
  selection: InvoicePaymentCycleTargetSelection,
  target: InvoicePaymentCycleTarget,
): boolean {
  return selection.target === target;
}

export function applyInvoicePaymentCycleTargetChange(
  selection: InvoicePaymentCycleTargetSelection,
  target: InvoicePaymentCycleTarget,
): InvoicePaymentCycleTargetSelection {
  if (target === "future") {
    return {
      target,
      futureCycleId: selection.futureCycleId,
    };
  }

  return { target };
}

function getNextStatementCycle(
  config: CreditCardBillingConfig,
  cycle: StatementCycle,
): StatementCycle {
  const { year, monthIndex } = parseIsoDate(cycle.closingDate);
  const next = addMonths(year, monthIndex, 1);
  const closingDate = getClosingDateInMonth(
    next.year,
    next.monthIndex,
    config.statementClosingDay,
  );

  return buildStatementCycle({
    closingDate,
    closingDay: config.statementClosingDay,
    dueDay: config.statementDueDay,
  });
}

/**
 * Open accumulating cycle for anticipation. When payment falls on the closing
 * day of the settled cycle, the next cycle is used (true early payment).
 */
export function getAnticipatedStatementCycle(
  config: CreditCardBillingConfig,
  paymentDate: string,
): StatementCycle {
  const previous = getStatementCyclePaidByPaymentDate(config, paymentDate);
  const openAtPayment = getCurrentStatementCycle(config, paymentDate);

  if (openAtPayment.cycleId !== previous.cycleId) {
    return openAtPayment;
  }

  return getNextStatementCycle(config, previous);
}

export function buildInvoicePaymentFutureCycleOptions(
  config: CreditCardBillingConfig,
  paymentDate: string,
  limit = 6,
): InvoicePaymentFutureCycleOption[] {
  const anchor = getAnticipatedStatementCycle(config, paymentDate);
  const options: InvoicePaymentFutureCycleOption[] = [];
  let cursor = getNextStatementCycle(config, anchor);

  for (let index = 0; index < limit; index += 1) {
    options.push({
      cycleId: cursor.cycleId,
      periodLabel: formatStatementPeriodLabel(cursor),
      dueDateLabel: formatFullBrDate(cursor.dueDate),
    });
    cursor = getNextStatementCycle(config, cursor);
  }

  return options;
}

export function buildInvoicePaymentCycleTargetOptions(
  config: CreditCardBillingConfig,
  paymentDate: string,
): InvoicePaymentCycleTargetOption[] {
  const previousCycle = getStatementCyclePaidByPaymentDate(config, paymentDate);
  const currentCycle = getAnticipatedStatementCycle(config, paymentDate);

  return [
    {
      target: "previous",
      label: "Fatura anterior",
      hint: "Quitar a fatura já fechada",
      cycleId: previousCycle.cycleId,
      periodLabel: formatStatementPeriodLabel(previousCycle),
      dueDateLabel: formatFullBrDate(previousCycle.dueDate),
      recommended: true,
    },
    {
      target: "current",
      label: "Fatura atual",
      hint: "Antecipar pagamento da fatura em aberto",
      cycleId: currentCycle.cycleId,
      periodLabel: formatStatementPeriodLabel(currentCycle),
      dueDateLabel: formatFullBrDate(currentCycle.dueDate),
      recommended: false,
    },
    {
      target: "future",
      label: "Fatura futura",
      hint: "Escolher uma fatura que ainda vai fechar",
      cycleId: "",
      periodLabel: "",
      dueDateLabel: "",
      recommended: false,
    },
  ];
}

export function resolveInvoicePaymentCycleTarget(
  config: CreditCardBillingConfig,
  paymentDate: string,
  selection: InvoicePaymentCycleTargetSelection,
): StatementCycle {
  const target = selection.target ?? "previous";

  if (target === "previous") {
    return getStatementCyclePaidByPaymentDate(config, paymentDate);
  }

  if (target === "current") {
    return getAnticipatedStatementCycle(config, paymentDate);
  }

  const futureOptions = buildInvoicePaymentFutureCycleOptions(config, paymentDate);
  const cycleId =
    selection.futureCycleId?.slice(0, 10) ?? futureOptions[0]?.cycleId ?? null;

  if (!cycleId) {
    return getAnticipatedStatementCycle(config, paymentDate);
  }

  return buildStatementCycle({
    closingDate: cycleId,
    closingDay: config.statementClosingDay,
    dueDay: config.statementDueDay,
  });
}

export function resolveImportedInvoicePaymentCycleId(input: {
  billingConfig: CreditCardBillingConfig | null;
  paymentDate: string;
  selection?: InvoicePaymentCycleTargetSelection;
}): string | null {
  if (!input.billingConfig) {
    return null;
  }

  const selection =
    input.selection ?? getDefaultInvoicePaymentCycleTargetSelection();

  return resolveInvoicePaymentCycleTarget(
    input.billingConfig,
    input.paymentDate,
    selection,
  ).cycleId;
}

export type InvoicePaymentCycleTargetImpactMessage = {
  text: string;
  /** Period label to highlight (e.g. future cycle). */
  highlight?: string;
};

export function getInvoicePaymentCycleTargetImpactMessage(input: {
  cycleTargetOptions: InvoicePaymentCycleTargetOption[];
  cycleTargetSelection: InvoicePaymentCycleTargetSelection;
  futureCycleOptions: InvoicePaymentFutureCycleOption[];
}): InvoicePaymentCycleTargetImpactMessage | null {
  const { cycleTargetSelection, cycleTargetOptions, futureCycleOptions } = input;
  const target = cycleTargetSelection.target;

  if (target === "previous") {
    const option = cycleTargetOptions.find((item) => item.target === "previous");
    if (!option?.periodLabel) {
      return null;
    }
    return {
      text: `Este crédito será aplicado à fatura ${option.periodLabel}.`,
      highlight: option.periodLabel,
    };
  }

  if (target === "current") {
    const option = cycleTargetOptions.find((item) => item.target === "current");
    if (!option?.periodLabel) {
      return null;
    }
    return {
      text: `Este crédito será tratado como antecipação da fatura ${option.periodLabel} (em aberto).`,
      highlight: option.periodLabel,
    };
  }

  if (target === "future") {
    const cycleId =
      cycleTargetSelection.futureCycleId ?? futureCycleOptions[0]?.cycleId;
    const future = futureCycleOptions.find((option) => option.cycleId === cycleId);
    if (!future) {
      return null;
    }
    return {
      text: `Este crédito será aplicado à fatura futura ${future.periodLabel}.`,
      highlight: future.periodLabel,
    };
  }

  return null;
}
