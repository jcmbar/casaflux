import {
  addMonths,
  getClosingDateInMonth,
  getDueDateForClosingDate,
  parseIsoDate,
  type CreditCardBillingConfig,
} from "@/lib/finance/credit-card-billing";
import {
  inferCreditCardBillingConfigFromInvoices,
  resolveStatementDueDayFromImported,
  type CardStatementCycleRecord,
} from "@/lib/finance/card-statement-cycles";
import { suggestStatementClosingDateForDueDate } from "@/lib/integrations/invoice-payment/invoice-payment-cycle-target";

/**
 * Result of inferring a statement closing date for credit-card CSV import.
 *
 * - User input source of truth: due date
 * - Persistence identity: materialized `closingDate` (high/low) or null (none)
 */
export type InferredImportStatementClosing =
  | { confidence: "high"; closingDate: string; reason: string }
  | { confidence: "low"; closingDate: string; reason: string }
  | { confidence: "none"; closingDate: null; reason: string };

export type InferImportStatementClosingInput = {
  /** Required user/file due date (`YYYY-MM-DD`). */
  dueDate: string;
  /**
   * Optional closing already provided by the user.
   * When valid, always wins with high confidence.
   */
  userClosingDate?: string | null;
  /** Card billing days when configured. */
  billingConfig?: CreditCardBillingConfig | null;
  /** Imported/manual cycles for the selected card (newest first not required). */
  importedCycles?: readonly CardStatementCycleRecord[];
};

function normalizeIsoDate(value: string | null | undefined): string | null {
  const key = value?.slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

/**
 * Find a closing date that, with the given due day, reproduces `dueDate` exactly.
 * Returns null when no candidate in the lookback window matches.
 */
function findExactClosingForDueDate(
  config: CreditCardBillingConfig,
  dueDate: string,
): string | null {
  const normalizedDue = dueDate.slice(0, 10);
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

  return null;
}

function findImportedCycleByDueDate(
  importedCycles: readonly CardStatementCycleRecord[],
  dueDate: string,
): CardStatementCycleRecord | null {
  const key = dueDate.slice(0, 10);
  const matches = importedCycles.filter(
    (cycle) => cycle.dueDate.slice(0, 10) === key,
  );
  if (matches.length === 0) {
    return null;
  }

  // Prefer newest closing when duplicates exist for the same due.
  return [...matches].sort((left, right) =>
    right.closingDate.localeCompare(left.closingDate),
  )[0]!;
}

function resolveEffectiveBillingConfig(input: {
  billingConfig?: CreditCardBillingConfig | null;
  importedCycles: readonly CardStatementCycleRecord[];
}): CreditCardBillingConfig | null {
  if (input.billingConfig) {
    const dueDay = resolveStatementDueDayFromImported(
      input.billingConfig,
      [...input.importedCycles],
    );
    return {
      statementClosingDay: input.billingConfig.statementClosingDay,
      statementDueDay: dueDay,
    };
  }

  return inferCreditCardBillingConfigFromInvoices([...input.importedCycles]);
}

/**
 * Infer a closing date to materialize for `card_statement_cycles` persistence.
 *
 * Priority:
 * 1. User-provided closing (high)
 * 2. Existing imported cycle with the same due (high)
 * 3. Closing that exactly reproduces the due via card/history days (high)
 * 4. Honest fallback from card closing day in the month before due (low)
 * 5. Not inferible (none)
 */
export function inferImportStatementClosing(
  input: InferImportStatementClosingInput,
): InferredImportStatementClosing {
  const dueDate = normalizeIsoDate(input.dueDate);
  if (!dueDate) {
    return {
      confidence: "none",
      closingDate: null,
      reason: "Vencimento inválido ou ausente.",
    };
  }

  const userClosing = normalizeIsoDate(input.userClosingDate);
  if (userClosing) {
    if (userClosing > dueDate) {
      return {
        confidence: "none",
        closingDate: null,
        reason:
          "O fechamento informado é posterior ao vencimento; ajuste as datas.",
      };
    }

    return {
      confidence: "high",
      closingDate: userClosing,
      reason: "Fechamento informado pelo usuário.",
    };
  }

  const importedCycles = input.importedCycles ?? [];
  const importedMatch = findImportedCycleByDueDate(importedCycles, dueDate);
  if (importedMatch) {
    const closingDate = importedMatch.closingDate.slice(0, 10);
    if (closingDate <= dueDate) {
      return {
        confidence: "high",
        closingDate,
        reason:
          "Reutilizamos o fechamento de uma fatura já importada com o mesmo vencimento.",
      };
    }
  }

  const effectiveConfig = resolveEffectiveBillingConfig({
    billingConfig: input.billingConfig,
    importedCycles,
  });

  if (!effectiveConfig) {
    return {
      confidence: "none",
      closingDate: null,
      reason:
        "Não há configuração de fechamento/vencimento no cartão nem histórico importado para inferir.",
    };
  }

  const exactClosing = findExactClosingForDueDate(effectiveConfig, dueDate);
  if (exactClosing && exactClosing <= dueDate) {
    return {
      confidence: "high",
      closingDate: exactClosing,
      reason:
        "Fechamento reproduz exatamente o vencimento com os dias do cartão/histórico.",
    };
  }

  const fallbackClosing = suggestStatementClosingDateForDueDate(
    effectiveConfig,
    dueDate,
  );
  if (fallbackClosing && fallbackClosing <= dueDate) {
    // suggestStatementClosingDateForDueDate returns exact match first; if we
    // reached here, this is the honest month-before fallback → low confidence.
    return {
      confidence: "low",
      closingDate: fallbackClosing,
      reason:
        "Sugestão aproximada pelo dia de fechamento do cartão (não reproduz o vencimento com exatidão).",
    };
  }

  return {
    confidence: "none",
    closingDate: null,
    reason: "Não foi possível inferir um fechamento válido para este vencimento.",
  };
}

export type MaterializedImportStatementFileCycle = {
  closingDate: string;
  dueDate: string;
};

export type ResolveMaterializedImportStatementFileCycleResult =
  | {
      ok: true;
      cycle: MaterializedImportStatementFileCycle;
      inference: InferredImportStatementClosing;
    }
  | {
      ok: false;
      message: string;
      inference: InferredImportStatementClosing;
      cycle: null;
    };

/**
 * Materialize the file statement cycle for commit/persistence.
 *
 * - due is required
 * - high inference → persist automatically
 * - low inference → only with explicit confirmation
 * - none → requires a valid user-provided closing (which becomes high via infer)
 */
export function resolveMaterializedImportStatementFileCycle(input: {
  dueDate: string;
  userClosingDate?: string | null;
  billingConfig?: CreditCardBillingConfig | null;
  importedCycles?: readonly CardStatementCycleRecord[];
  /** Explicit opt-in to persist a low-confidence suggested closing. */
  confirmLowConfidenceClosing?: boolean;
}): ResolveMaterializedImportStatementFileCycleResult {
  const dueDate = normalizeIsoDate(input.dueDate);
  if (!dueDate) {
    return {
      ok: false,
      cycle: null,
      message: "Informe a data de vencimento da fatura deste arquivo.",
      inference: {
        confidence: "none",
        closingDate: null,
        reason: "Vencimento inválido ou ausente.",
      },
    };
  }

  const inference = inferImportStatementClosing({
    dueDate,
    userClosingDate: input.userClosingDate,
    billingConfig: input.billingConfig,
    importedCycles: input.importedCycles,
  });

  if (inference.confidence === "high") {
    return {
      ok: true,
      cycle: { closingDate: inference.closingDate, dueDate },
      inference,
    };
  }

  if (inference.confidence === "low") {
    if (input.confirmLowConfidenceClosing) {
      return {
        ok: true,
        cycle: { closingDate: inference.closingDate, dueDate },
        inference,
      };
    }

    return {
      ok: false,
      cycle: null,
      message:
        "Confirme o fechamento sugerido antes de aplicar a importação.",
      inference,
    };
  }

  return {
    ok: false,
    cycle: null,
    message: "Informe a data de fechamento da fatura deste arquivo.",
    inference,
  };
}
