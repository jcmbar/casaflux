import type { CreditCardBillingConfig } from "@/lib/finance/credit-card-billing";
import type { CardStatementCycleRecord } from "@/lib/finance/card-statement-cycles";
import type { NubankStatementPeriod } from "@/lib/integrations/sources/nubank/statement-period";

function normalizeIsoDate(value: string | null | undefined): string | null {
  const key = value?.slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

/**
 * @deprecated Closing-day inference is no longer used to materialize import cycles.
 * Kept as a thin adapter for UI that still shows an optional informational closing.
 * Returns the statement period end (last activity) when available.
 */
export type InferredImportStatementClosing =
  | { confidence: "high"; closingDate: string; reason: string }
  | { confidence: "low"; closingDate: string; reason: string }
  | { confidence: "none"; closingDate: null; reason: string };

export type InferImportStatementClosingInput = {
  dueDate: string;
  /** @deprecated Ignored for cycle identity; optional informational only. */
  userClosingDate?: string | null;
  /** @deprecated Use statementPeriod.end instead. */
  statementActivityMaxDate?: string | null;
  /** Official CSV period (min/max or explicit text). */
  statementPeriod?: Pick<NubankStatementPeriod, "start" | "end"> | null;
  billingConfig?: CreditCardBillingConfig | null;
  importedCycles?: readonly CardStatementCycleRecord[];
};

/**
 * Informational "closing" = last day of the CSV period (not card closing day).
 * Never invents a due date and never uses statementClosingDay.
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

  const periodEnd =
    normalizeIsoDate(input.statementPeriod?.end) ??
    normalizeIsoDate(input.statementActivityMaxDate) ??
    normalizeIsoDate(input.userClosingDate);

  if (!periodEnd) {
    return {
      confidence: "none",
      closingDate: null,
      reason: "Informe o vencimento e o período do extrato (datas do CSV).",
    };
  }

  if (periodEnd > dueDate) {
    return {
      confidence: "low",
      closingDate: periodEnd,
      reason:
        "A última data do extrato é posterior ao vencimento informado — confira o vencimento.",
    };
  }

  return {
    confidence: "high",
    closingDate: periodEnd,
    reason: "Última data do período do extrato (informativo; o ciclo usa o vencimento).",
  };
}

export type MaterializedImportStatementFileCycle = {
  /**
   * Persistence identity for imported cycles = due date (user/CSV),
   * so we never invent a sibling cycle from card closing-day math.
   */
  closingDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
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
 * Domain rules:
 * - dueDate: required from the user (or explicit Nubank due) — never invented
 * - period: exclusively from the CSV (explicit "Período" or min/max dates)
 * - closingDate: equals dueDate (stable identity); periodEnd stays informational
 */
export function resolveMaterializedImportStatementFileCycle(input: {
  dueDate: string;
  /** CSV statement period (required for Nubank CC). */
  statementPeriod?: Pick<NubankStatementPeriod, "start" | "end"> | null;
  /** @deprecated Prefer statementPeriod. */
  statementActivityMaxDate?: string | null;
  /** @deprecated Not used for identity. */
  userClosingDate?: string | null;
  billingConfig?: CreditCardBillingConfig | null;
  importedCycles?: readonly CardStatementCycleRecord[];
  /** @deprecated Closing confirmation is no longer required. */
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

  const periodStart = normalizeIsoDate(input.statementPeriod?.start);
  const periodEnd =
    normalizeIsoDate(input.statementPeriod?.end) ??
    normalizeIsoDate(input.statementActivityMaxDate);

  if (!periodStart || !periodEnd) {
    return {
      ok: false,
      cycle: null,
      message:
        "Não foi possível ler o período do extrato (datas do CSV).",
      inference: {
        confidence: "none",
        closingDate: null,
        reason: "Período do CSV ausente.",
      },
    };
  }

  if (periodStart > periodEnd) {
    return {
      ok: false,
      cycle: null,
      message: "Período do extrato inválido (início após o fim).",
      inference: {
        confidence: "none",
        closingDate: null,
        reason: "Período inválido.",
      },
    };
  }

  const inference = inferImportStatementClosing({
    dueDate,
    statementPeriod: { start: periodStart, end: periodEnd },
  });

  // Identity = due date the user informed — never a card-day-derived closing.
  return {
    ok: true,
    cycle: {
      closingDate: dueDate,
      dueDate,
      periodStart,
      periodEnd,
    },
    inference,
  };
}
