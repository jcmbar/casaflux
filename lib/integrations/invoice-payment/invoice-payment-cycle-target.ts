import {
  addMonths,
  buildStatementCycle,
  formatFullBrDate,
  formatStatementPeriodLabel,
  getClosingDateInMonth,
  getCurrentStatementCycle,
  getDueDateForClosingDate,
  getStatementCyclePaidByPaymentDate,
  parseIsoDate,
  type CreditCardBillingConfig,
  type StatementCycle,
} from "@/lib/finance/credit-card-billing";
import type { CardStatementCycleRecord } from "@/lib/finance/card-statement-cycles";
import { formatCurrency } from "@/lib/format";

export type InvoicePaymentCycleTarget = "previous" | "current" | "future";

/**
 * User selection for which statement a payment settles.
 *
 * Domain source of truth: `targetDueDate` (fatura com vencimento em …).
 * `target` / `futureCycleId` remain as UX suggestion shortcuts + legacy fallback.
 */
export type InvoicePaymentCycleTargetSelection = {
  /** Suggestion bucket (anterior / atual / futura) — not authoritative when due is set. */
  target: InvoicePaymentCycleTarget;
  /** Legacy closing-date ISO when target is "future" and due is absent. */
  futureCycleId?: string;
  /** Authoritative ISO due date of the target statement (`YYYY-MM-DD`). */
  targetDueDate?: string;
};

/** Select option keyed by statement due date. */
export type InvoicePaymentDueDateOption = {
  dueDate: string;
  dueDateLabel: string;
  cycleId: string;
  periodLabel: string;
  amountDue: number | null;
  amountKnown: boolean;
  summaryLine: string;
  /** Matching suggestion bucket when this due is previous/current/future. */
  suggestion: InvoicePaymentCycleTarget | null;
  recommended: boolean;
};

/** Real closing/due of the CSV statement file (user-provided). */
export type InvoicePaymentFileCycle = {
  closingDate: string;
  dueDate: string;
  periodStart?: string | null;
  periodEnd?: string | null;
};

export type InvoicePaymentCycleResolveContext = {
  fileCycle?: InvoicePaymentFileCycle | null;
  importedCycles?: readonly CardStatementCycleRecord[];
};

export type InvoicePaymentCycleTargetOption = {
  target: InvoicePaymentCycleTarget;
  label: string;
  /** Short effect explanation under the amount line. */
  hint: string;
  cycleId: string;
  periodLabel: string;
  dueDate: string | null;
  dueDateLabel: string;
  /** Issuer / imported amount when known. */
  amountDue: number | null;
  amountKnown: boolean;
  /**
   * Primary detail line, e.g.
   * `R$ 3.844,33 com vencimento em 04/05/2026`
   * or `Valor ainda não importado · vence em 01/06/2026`
   */
  summaryLine: string;
  recommended: boolean;
};

export type InvoicePaymentFutureCycleOption = {
  cycleId: string;
  periodLabel: string;
  dueDate: string;
  dueDateLabel: string;
  amountDue: number | null;
  amountKnown: boolean;
  summaryLine: string;
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
  if (selection.targetDueDate) {
    return selection.target === target;
  }
  return selection.target === target;
}

/**
 * Suggestion shortcut: only fills `targetDueDate` from a bucket hint.
 * The due date remains editable afterward.
 */
export function applyInvoicePaymentCycleTargetChange(
  selection: InvoicePaymentCycleTargetSelection,
  target: InvoicePaymentCycleTarget,
  dueDateFromOption?: string | null,
  futureCycleIdFromOption?: string | null,
): InvoicePaymentCycleTargetSelection {
  const due = dueDateFromOption?.slice(0, 10) || null;
  if (!due) {
    return { target, futureCycleId: selection.futureCycleId };
  }

  if (target === "future") {
    return {
      target,
      futureCycleId:
        futureCycleIdFromOption?.slice(0, 10) ?? selection.futureCycleId,
      targetDueDate: due,
    };
  }

  return {
    target,
    targetDueDate: due,
  };
}

/**
 * Derive anterior/atual/futura only when the chosen due matches a suggestion
 * bucket exactly. Never invent a label from synthetic monthly projections.
 */
export function deriveInvoicePaymentSuggestionForDueDate(
  dueDate: string,
  config: CreditCardBillingConfig,
  paymentDate: string,
  context?: InvoicePaymentCycleResolveContext | null,
): InvoicePaymentCycleTarget | null {
  const key = dueDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return null;
  }

  const buckets = buildInvoicePaymentCycleTargetOptions(
    config,
    paymentDate,
    context,
  );
  for (const bucket of buckets) {
    if (bucket.dueDate?.slice(0, 10) === key) {
      return bucket.target;
    }
  }

  return null;
}

/**
 * Primary control: user types any real due date. Labels are derived afterward.
 */
export function applyInvoicePaymentDueDateChange(
  dueDate: string,
  config?: CreditCardBillingConfig | null,
  paymentDate?: string,
  context?: InvoicePaymentCycleResolveContext | null,
  /** @deprecated Ignored — kept so older call sites still type-check during migration. */
  _legacyOptions?: readonly InvoicePaymentDueDateOption[],
): InvoicePaymentCycleTargetSelection {
  const key = dueDate.slice(0, 10);
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return { target: "previous" };
  }

  if (config && paymentDate) {
    const suggestion = deriveInvoicePaymentSuggestionForDueDate(
      key,
      config,
      paymentDate,
      context,
    );
    return {
      target: suggestion ?? "previous",
      targetDueDate: key,
      futureCycleId: suggestion === "future" ? undefined : undefined,
    };
  }

  return {
    target: "previous",
    targetDueDate: key,
  };
}

/**
 * Ensures `targetDueDate` is set from options (default: recommended / previous).
 */
export function hydrateInvoicePaymentCycleTargetSelection(
  selection: InvoicePaymentCycleTargetSelection,
  config: CreditCardBillingConfig,
  paymentDate: string,
  context?: InvoicePaymentCycleResolveContext | null,
): InvoicePaymentCycleTargetSelection {
  if (selection.targetDueDate && /^\d{4}-\d{2}-\d{2}$/.test(selection.targetDueDate)) {
    const due = selection.targetDueDate.slice(0, 10);
    const suggestion = deriveInvoicePaymentSuggestionForDueDate(
      due,
      config,
      paymentDate,
      context,
    );
    return {
      ...selection,
      targetDueDate: due,
      target: suggestion ?? selection.target,
    };
  }

  const buckets = buildInvoicePaymentCycleTargetOptions(
    config,
    paymentDate,
    context,
  );
  const bySuggestion = buckets.find(
    (option) => option.target === (selection.target ?? "previous"),
  );
  const recommended =
    buckets.find((option) => option.recommended) ?? buckets[0] ?? null;
  const chosen = bySuggestion ?? recommended;
  if (!chosen?.dueDate) {
    return selection;
  }

  return {
    target: chosen.target,
    targetDueDate: chosen.dueDate,
    futureCycleId:
      chosen.target === "future" ? chosen.cycleId : selection.futureCycleId,
  };
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

function sortImportedCyclesByClosing(
  importedCycles: readonly CardStatementCycleRecord[] | undefined,
): CardStatementCycleRecord[] {
  if (!importedCycles?.length) {
    return [];
  }

  return [...importedCycles].sort((left, right) =>
    left.closingDate.localeCompare(right.closingDate),
  );
}

function findImportedCycleByClosing(
  importedCycles: readonly CardStatementCycleRecord[] | undefined,
  closingDate: string,
): CardStatementCycleRecord | null {
  if (!importedCycles?.length) {
    return null;
  }

  const key = closingDate.slice(0, 10);
  return (
    importedCycles.find((cycle) => cycle.closingDate.slice(0, 10) === key) ??
    null
  );
}

function findImportedCycleByDueDate(
  importedCycles: readonly CardStatementCycleRecord[] | undefined,
  dueDate: string,
): CardStatementCycleRecord | null {
  if (!importedCycles?.length) {
    return null;
  }

  const key = dueDate.slice(0, 10);
  return (
    importedCycles.find((cycle) => cycle.dueDate.slice(0, 10) === key) ?? null
  );
}

/**
 * Next real imported cycle after a closing date (chronological).
 * Prefer this over synthetic closing-day math when history exists.
 */
export function findNextImportedCycleAfter(
  importedCycles: readonly CardStatementCycleRecord[] | undefined,
  closingDate: string,
): CardStatementCycleRecord | null {
  const key = closingDate.slice(0, 10);
  return (
    sortImportedCyclesByClosing(importedCycles).find(
      (cycle) => cycle.closingDate.slice(0, 10) > key,
    ) ?? null
  );
}

/**
 * Latest real imported cycle with closing on/before a reference date.
 */
export function findLatestImportedCycleOnOrBefore(
  importedCycles: readonly CardStatementCycleRecord[] | undefined,
  referenceDate: string,
): CardStatementCycleRecord | null {
  const key = referenceDate.slice(0, 10);
  const sorted = sortImportedCyclesByClosing(importedCycles);
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const cycle = sorted[index]!;
    if (cycle.closingDate.slice(0, 10) <= key) {
      return cycle;
    }
  }
  return null;
}

function importedRecordToStatementCycle(
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

function findImportedCycleForStatement(
  cycle: StatementCycle,
  importedCycles?: readonly CardStatementCycleRecord[],
): CardStatementCycleRecord | null {
  return (
    findImportedCycleByClosing(importedCycles, cycle.cycleId) ??
    findImportedCycleByDueDate(importedCycles, cycle.dueDate)
  );
}

/**
 * Prefer real imported cycle dates/amounts; keep synthetic only as fallback.
 */
export function preferImportedStatementCycle(
  cycle: StatementCycle,
  importedCycles?: readonly CardStatementCycleRecord[],
): StatementCycle {
  const imported = findImportedCycleForStatement(cycle, importedCycles);
  if (!imported) {
    return cycle;
  }

  return importedRecordToStatementCycle(imported);
}

/**
 * Advance one cycle: next real imported row when present, else closing-day math.
 */
export function resolveNextStatementCycle(
  config: CreditCardBillingConfig,
  fromCycle: StatementCycle,
  importedCycles?: readonly CardStatementCycleRecord[],
): StatementCycle {
  const nextImported = findNextImportedCycleAfter(
    importedCycles,
    fromCycle.closingDate,
  );
  if (nextImported) {
    return importedRecordToStatementCycle(nextImported);
  }

  return preferImportedStatementCycle(
    getNextStatementCycle(config, fromCycle),
    importedCycles,
  );
}

export function buildFileStatementCycle(
  config: CreditCardBillingConfig,
  fileCycle: InvoicePaymentFileCycle,
): StatementCycle {
  const closingDate = fileCycle.closingDate.slice(0, 10);
  const synthetic = buildStatementCycle({
    closingDate,
    closingDay: config.statementClosingDay,
    dueDay: config.statementDueDay,
  });

  return {
    ...synthetic,
    periodStart: fileCycle.periodStart?.slice(0, 10) ?? synthetic.periodStart,
    periodEnd: fileCycle.periodEnd?.slice(0, 10) ?? synthetic.periodEnd,
    dueDate: fileCycle.dueDate.slice(0, 10),
    source: "imported",
  };
}

/**
 * Suggests closing date from a due date using the card's closing/due day pair.
 */
export function suggestStatementClosingDateForDueDate(
  config: CreditCardBillingConfig,
  dueDate: string,
): string | null {
  const normalizedDue = dueDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDue)) {
    return null;
  }

  const { year, monthIndex } = parseIsoDate(normalizedDue);

  for (let offset = 0; offset <= 3; offset += 1) {
    const month = addMonths(year, monthIndex, -offset);
    const closingDate = getClosingDateInMonth(
      month.year,
      month.monthIndex,
      config.statementClosingDay,
    );
    const computedDue = getDueDateForClosingDate(
      closingDate,
      config.statementDueDay,
    );
    if (computedDue === normalizedDue) {
      return closingDate;
    }
  }

  // Honest fallback: closing day in the month before the due date.
  const previous = addMonths(year, monthIndex, -1);
  return getClosingDateInMonth(
    previous.year,
    previous.monthIndex,
    config.statementClosingDay,
  );
}

export function isValidInvoicePaymentFileCycle(
  fileCycle: InvoicePaymentFileCycle | null | undefined,
): fileCycle is InvoicePaymentFileCycle {
  if (!fileCycle) {
    return false;
  }

  const closingDate = fileCycle.closingDate?.slice(0, 10) ?? "";
  const dueDate = fileCycle.dueDate?.slice(0, 10) ?? "";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(closingDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)
  ) {
    return false;
  }

  return closingDate <= dueDate;
}

function buildAmountSummaryLine(input: {
  amountDue: number | null;
  dueDateLabel: string;
}): string {
  if (input.amountDue != null) {
    return `${formatCurrency(input.amountDue)} com vencimento em ${input.dueDateLabel}`;
  }

  return `Valor ainda não importado · vence em ${input.dueDateLabel}`;
}

function toDisplayOptionFields(
  cycle: StatementCycle,
  importedCycles?: readonly CardStatementCycleRecord[],
): Pick<
  InvoicePaymentCycleTargetOption,
  | "cycleId"
  | "periodLabel"
  | "dueDate"
  | "dueDateLabel"
  | "amountDue"
  | "amountKnown"
  | "summaryLine"
> {
  const enriched = preferImportedStatementCycle(cycle, importedCycles);
  const amountDue =
    enriched.issuerAmountDue == null ? null : Number(enriched.issuerAmountDue);
  const dueDateLabel = formatFullBrDate(enriched.dueDate);

  return {
    cycleId: enriched.cycleId,
    periodLabel: formatStatementPeriodLabel(enriched),
    dueDate: enriched.dueDate,
    dueDateLabel,
    amountDue,
    amountKnown: amountDue != null,
    summaryLine: buildAmountSummaryLine({ amountDue, dueDateLabel }),
  };
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

/**
 * Resolve previous (closed) and current (open) cycles for invoice payment UI.
 * Priority: real imported cycles / file cycle → closing-day fallback.
 */
export function resolveInvoicePaymentCycleAnchors(
  config: CreditCardBillingConfig,
  paymentDate: string,
  context?: InvoicePaymentCycleResolveContext | null,
): { previous: StatementCycle; current: StatementCycle } {
  const importedCycles = context?.importedCycles;
  const fileCycle = context?.fileCycle;

  if (fileCycle && isValidInvoicePaymentFileCycle(fileCycle)) {
    const fileAsCycle = buildFileStatementCycle(config, fileCycle);
    const matchedPrevious =
      findImportedCycleByClosing(importedCycles, fileAsCycle.closingDate) ??
      findImportedCycleByDueDate(importedCycles, fileAsCycle.dueDate);
    const previous = matchedPrevious
      ? importedRecordToStatementCycle(matchedPrevious)
      : fileAsCycle;
    const current = resolveNextStatementCycle(
      config,
      previous,
      importedCycles,
    );
    return { previous, current };
  }

  const previousImported = findLatestImportedCycleOnOrBefore(
    importedCycles,
    paymentDate,
  );
  if (previousImported) {
    const previous = importedRecordToStatementCycle(previousImported);
    const current = resolveNextStatementCycle(
      config,
      previous,
      importedCycles,
    );
    return { previous, current };
  }

  const previous = preferImportedStatementCycle(
    getStatementCyclePaidByPaymentDate(config, paymentDate),
    importedCycles,
  );
  const current = resolveNextStatementCycle(config, previous, importedCycles);

  return { previous, current };
}

export function buildInvoicePaymentFutureCycleOptions(
  config: CreditCardBillingConfig,
  paymentDate: string,
  limit = 6,
  context?: InvoicePaymentCycleResolveContext | null,
): InvoicePaymentFutureCycleOption[] {
  const { current } = resolveInvoicePaymentCycleAnchors(
    config,
    paymentDate,
    context,
  );
  const options: InvoicePaymentFutureCycleOption[] = [];
  let cursor = current;

  for (let index = 0; index < limit; index += 1) {
    cursor = resolveNextStatementCycle(
      config,
      cursor,
      context?.importedCycles,
    );
    const fields = toDisplayOptionFields(cursor, context?.importedCycles);
    options.push({
      cycleId: fields.cycleId,
      periodLabel: fields.periodLabel,
      dueDate: fields.dueDate ?? cursor.dueDate,
      dueDateLabel: fields.dueDateLabel,
      amountDue: fields.amountDue,
      amountKnown: fields.amountKnown,
      summaryLine: fields.summaryLine,
    });
  }

  return options;
}

export function buildInvoicePaymentCycleTargetOptions(
  config: CreditCardBillingConfig,
  paymentDate: string,
  context?: InvoicePaymentCycleResolveContext | null,
): InvoicePaymentCycleTargetOption[] {
  const { previous, current } = resolveInvoicePaymentCycleAnchors(
    config,
    paymentDate,
    context,
  );
  const futureOptions = buildInvoicePaymentFutureCycleOptions(
    config,
    paymentDate,
    1,
    context,
  );
  const firstFuture = futureOptions[0] ?? null;

  return [
    {
      target: "previous",
      label: "Fatura anterior",
      hint: "Quitação da fatura já fechada.",
      recommended: true,
      ...toDisplayOptionFields(previous, context?.importedCycles),
    },
    {
      target: "current",
      label: "Fatura atual",
      hint: "Antecipação ou amortização da fatura em aberto.",
      recommended: false,
      ...toDisplayOptionFields(current, context?.importedCycles),
    },
    {
      target: "future",
      label: "Fatura futura",
      hint: "Crédito em uma fatura que ainda vai fechar.",
      recommended: false,
      cycleId: firstFuture?.cycleId ?? "",
      periodLabel: firstFuture?.periodLabel ?? "",
      dueDate: firstFuture?.dueDate ?? null,
      dueDateLabel: firstFuture?.dueDateLabel ?? "",
      amountDue: firstFuture?.amountDue ?? null,
      amountKnown: firstFuture?.amountKnown ?? false,
      summaryLine: firstFuture
        ? firstFuture.summaryLine
        : "Escolha o vencimento da fatura futura.",
    },
  ];
}

/**
 * Flattened statement list keyed by due date — primary UX choices.
 * Includes real imported cycles plus suggestion buckets / estimated futures.
 */
export function buildInvoicePaymentDueDateOptions(
  config: CreditCardBillingConfig,
  paymentDate: string,
  context?: InvoicePaymentCycleResolveContext | null,
  futureLimit = 6,
): InvoicePaymentDueDateOption[] {
  const byDue = new Map<string, InvoicePaymentDueDateOption>();

  const preferSuggestion = (
    left: InvoicePaymentCycleTarget | null,
    right: InvoicePaymentCycleTarget | null,
  ): InvoicePaymentCycleTarget | null => {
    const rank: Record<InvoicePaymentCycleTarget, number> = {
      previous: 3,
      current: 2,
      future: 1,
    };
    if (!left) return right;
    if (!right) return left;
    return rank[left] >= rank[right] ? left : right;
  };

  const upsert = (option: InvoicePaymentDueDateOption) => {
    const key = option.dueDate.slice(0, 10);
    const existing = byDue.get(key);
    if (!existing) {
      byDue.set(key, { ...option, dueDate: key });
      return;
    }

    byDue.set(key, {
      ...existing,
      ...option,
      dueDate: key,
      suggestion: preferSuggestion(existing.suggestion, option.suggestion),
      recommended: option.recommended || existing.recommended,
      amountDue: option.amountKnown ? option.amountDue : existing.amountDue,
      amountKnown: option.amountKnown || existing.amountKnown,
      summaryLine: option.amountKnown ? option.summaryLine : existing.summaryLine,
      cycleId: option.cycleId || existing.cycleId,
      periodLabel: option.periodLabel || existing.periodLabel,
    });
  };

  for (const record of sortImportedCyclesByClosing(context?.importedCycles)) {
    const amountDue =
      record.amountDue == null ? null : Number(record.amountDue);
    const dueDateLabel = formatFullBrDate(record.dueDate);
    upsert({
      dueDate: record.dueDate,
      dueDateLabel,
      cycleId: record.closingDate,
      periodLabel: formatStatementPeriodLabel(
        importedRecordToStatementCycle(record),
      ),
      amountDue,
      amountKnown: amountDue != null,
      summaryLine: buildAmountSummaryLine({ amountDue, dueDateLabel }),
      suggestion: null,
      recommended: false,
    });
  }

  const fileCycle = context?.fileCycle;
  if (fileCycle && isValidInvoicePaymentFileCycle(fileCycle)) {
    const cycle = buildFileStatementCycle(config, fileCycle);
    const fields = toDisplayOptionFields(cycle, context?.importedCycles);
    if (fields.dueDate) {
      upsert({
        dueDate: fields.dueDate,
        dueDateLabel: fields.dueDateLabel,
        cycleId: fields.cycleId,
        periodLabel: fields.periodLabel,
        amountDue: fields.amountDue,
        amountKnown: fields.amountKnown,
        summaryLine: fields.summaryLine,
        suggestion: null,
        recommended: false,
      });
    }
  }

  const buckets = buildInvoicePaymentCycleTargetOptions(
    config,
    paymentDate,
    context,
  );
  for (const bucket of buckets) {
    if (!bucket.dueDate) continue;
    upsert({
      dueDate: bucket.dueDate,
      dueDateLabel: bucket.dueDateLabel,
      cycleId: bucket.cycleId,
      periodLabel: bucket.periodLabel,
      amountDue: bucket.amountDue,
      amountKnown: bucket.amountKnown,
      summaryLine: bucket.summaryLine,
      suggestion: bucket.target,
      recommended: bucket.recommended,
    });
  }

  for (const future of buildInvoicePaymentFutureCycleOptions(
    config,
    paymentDate,
    futureLimit,
    context,
  )) {
    upsert({
      dueDate: future.dueDate,
      dueDateLabel: future.dueDateLabel,
      cycleId: future.cycleId,
      periodLabel: future.periodLabel,
      amountDue: future.amountDue,
      amountKnown: future.amountKnown,
      summaryLine: future.summaryLine,
      suggestion: "future",
      recommended: false,
    });
  }

  return [...byDue.values()].sort((left, right) =>
    left.dueDate.localeCompare(right.dueDate),
  );
}

/**
 * Resolve a statement cycle from an explicit due date (domain source of truth).
 */
export function resolveStatementCycleForDueDate(
  config: CreditCardBillingConfig,
  dueDate: string,
  context?: InvoicePaymentCycleResolveContext | null,
): StatementCycle {
  const normalizedDue = dueDate.slice(0, 10);

  const imported = findImportedCycleByDueDate(
    context?.importedCycles,
    normalizedDue,
  );
  if (imported) {
    return importedRecordToStatementCycle(imported);
  }

  const fromOptions = buildInvoicePaymentDueDateOptions(
    config,
    normalizedDue,
    context,
  ).find((option) => option.dueDate === normalizedDue);
  if (fromOptions) {
    const byClosing = findImportedCycleByClosing(
      context?.importedCycles,
      fromOptions.cycleId,
    );
    if (byClosing) {
      return importedRecordToStatementCycle(byClosing);
    }

    return {
      ...buildStatementCycle({
        closingDate: fromOptions.cycleId,
        closingDay: config.statementClosingDay,
        dueDay: config.statementDueDay,
      }),
      dueDate: normalizedDue,
      issuerAmountDue: fromOptions.amountDue,
      source: "derived",
    };
  }

  const closing =
    suggestStatementClosingDateForDueDate(config, normalizedDue) ??
    normalizedDue;
  return {
    ...buildStatementCycle({
      closingDate: closing,
      closingDay: config.statementClosingDay,
      dueDay: config.statementDueDay,
    }),
    dueDate: normalizedDue,
  };
}

export function resolveInvoicePaymentCycleTarget(
  config: CreditCardBillingConfig,
  paymentDate: string,
  selection: InvoicePaymentCycleTargetSelection,
  context?: InvoicePaymentCycleResolveContext | null,
): StatementCycle {
  const dueDate = selection.targetDueDate?.slice(0, 10);
  if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return resolveStatementCycleForDueDate(config, dueDate, context);
  }

  const target = selection.target ?? "previous";
  const { previous, current } = resolveInvoicePaymentCycleAnchors(
    config,
    paymentDate,
    context,
  );

  if (target === "previous") {
    return previous;
  }

  if (target === "current") {
    return current;
  }

  const futureOptions = buildInvoicePaymentFutureCycleOptions(
    config,
    paymentDate,
    6,
    context,
  );
  const cycleId =
    selection.futureCycleId?.slice(0, 10) ?? futureOptions[0]?.cycleId ?? null;

  if (!cycleId) {
    return resolveNextStatementCycle(
      config,
      current,
      context?.importedCycles,
    );
  }

  const fromOptions = futureOptions.find((option) => option.cycleId === cycleId);
  if (fromOptions) {
    const imported =
      findImportedCycleByClosing(context?.importedCycles, cycleId) ??
      findImportedCycleByDueDate(context?.importedCycles, fromOptions.dueDate);
    if (imported) {
      return importedRecordToStatementCycle(imported);
    }

    return {
      ...buildStatementCycle({
        closingDate: cycleId,
        closingDay: config.statementClosingDay,
        dueDay: config.statementDueDay,
      }),
      dueDate: fromOptions.dueDate,
      issuerAmountDue: fromOptions.amountDue,
    };
  }

  const synthetic = buildStatementCycle({
    closingDate: cycleId,
    closingDay: config.statementClosingDay,
    dueDay: config.statementDueDay,
  });

  return preferImportedStatementCycle(synthetic, context?.importedCycles);
}

export function resolveImportedInvoicePaymentCycleId(input: {
  billingConfig: CreditCardBillingConfig | null;
  paymentDate: string;
  selection?: InvoicePaymentCycleTargetSelection;
  context?: InvoicePaymentCycleResolveContext | null;
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
    input.context,
  ).cycleId;
}

/**
 * Maps persisted payment linkage back to the UI selection
 * (due date + suggestion bucket) for post-import edits.
 * Prefers `statementDueDate` when present.
 */
export function inferInvoicePaymentCycleTargetSelection(
  config: CreditCardBillingConfig,
  paymentDate: string,
  statementCycleId: string | null | undefined,
  context?: InvoicePaymentCycleResolveContext | null,
  statementDueDate?: string | null,
): InvoicePaymentCycleTargetSelection {
  const dueDate = statementDueDate?.slice(0, 10) ?? null;
  if (dueDate) {
    return hydrateInvoicePaymentCycleTargetSelection(
      {
        target: "previous",
        targetDueDate: dueDate,
      },
      config,
      paymentDate,
      context,
    );
  }

  const cycleId = statementCycleId?.slice(0, 10) ?? null;
  if (!cycleId) {
    return hydrateInvoicePaymentCycleTargetSelection(
      getDefaultInvoicePaymentCycleTargetSelection(),
      config,
      paymentDate,
      context,
    );
  }

  const dueOptions = buildInvoicePaymentDueDateOptions(
    config,
    paymentDate,
    context,
  );
  const byClosing = dueOptions.find((option) => option.cycleId === cycleId);
  if (byClosing) {
    return {
      target: byClosing.suggestion ?? "future",
      targetDueDate: byClosing.dueDate,
      futureCycleId:
        byClosing.suggestion === "future" ? byClosing.cycleId : undefined,
    };
  }

  const imported = findImportedCycleByClosing(context?.importedCycles, cycleId);
  if (imported) {
    return {
      target: "future",
      targetDueDate: imported.dueDate,
      futureCycleId: imported.closingDate,
    };
  }

  const synthetic = buildStatementCycle({
    closingDate: cycleId,
    closingDay: config.statementClosingDay,
    dueDay: config.statementDueDay,
  });

  return {
    target: "future",
    targetDueDate: synthetic.dueDate,
    futureCycleId: cycleId,
  };
}

export type InvoicePaymentCycleTargetImpactMessage = {
  text: string;
  /** Fragment to highlight (due label or amount). */
  highlight?: string;
};

export function getInvoicePaymentCycleTargetImpactMessage(input: {
  cycleTargetOptions: InvoicePaymentCycleTargetOption[];
  cycleTargetSelection: InvoicePaymentCycleTargetSelection;
  futureCycleOptions: InvoicePaymentFutureCycleOption[];
  dueDateOptions?: InvoicePaymentDueDateOption[];
}): InvoicePaymentCycleTargetImpactMessage | null {
  const {
    cycleTargetSelection,
    cycleTargetOptions,
    futureCycleOptions,
    dueDateOptions,
  } = input;

  const dueKey = cycleTargetSelection.targetDueDate?.slice(0, 10);
  if (dueKey && /^\d{4}-\d{2}-\d{2}$/.test(dueKey)) {
    const dueDateLabel = formatFullBrDate(dueKey);
    const exactBucket = cycleTargetOptions.find(
      (option) => option.dueDate?.slice(0, 10) === dueKey,
    );
    const exactDue = dueDateOptions?.find(
      (option) => option.dueDate.slice(0, 10) === dueKey,
    );
    const suggestion =
      exactBucket?.target ?? exactDue?.suggestion ?? null;

    if (suggestion === "previous") {
      return {
        text: `Este crédito quita a fatura com vencimento em ${dueDateLabel}.`,
        highlight: dueDateLabel,
      };
    }
    if (suggestion === "current") {
      return {
        text: `Este crédito antecipa/amortiza a fatura com vencimento em ${dueDateLabel}.`,
        highlight: dueDateLabel,
      };
    }
    return {
      text: `Este crédito será aplicado à fatura com vencimento em ${dueDateLabel}.`,
      highlight: dueDateLabel,
    };
  }

  const target = cycleTargetSelection.target;

  if (target === "previous") {
    const option = cycleTargetOptions.find((item) => item.target === "previous");
    if (!option?.dueDateLabel) {
      return null;
    }
    return {
      text: `Este crédito quita a fatura anterior com vencimento em ${option.dueDateLabel}.`,
      highlight: option.dueDateLabel,
    };
  }

  if (target === "current") {
    const option = cycleTargetOptions.find((item) => item.target === "current");
    if (!option?.dueDateLabel) {
      return null;
    }
    return {
      text: `Este crédito antecipa/amortiza a fatura atual com vencimento em ${option.dueDateLabel}.`,
      highlight: option.dueDateLabel,
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
      text: `Este crédito será aplicado à fatura futura com vencimento em ${future.dueDateLabel}.`,
      highlight: future.dueDateLabel,
    };
  }

  return null;
}
