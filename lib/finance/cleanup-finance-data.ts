import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyTransactionsChanged } from "@/lib/finance/create-transaction";
import { notifyRecurrencesChanged } from "@/lib/finance/recurrence-occurrences";

export const CLEANUP_BLOCKS = [
  "transactions",
  "accounts",
  "goals",
  "budgets",
  "all",
] as const;

export type CleanupFinanceBlock = (typeof CLEANUP_BLOCKS)[number];

export const CLEANUP_ALL_CONFIRMATION_PHRASE = "APAGAR TUDO";

/** Entities that transactional cleanup / import rollback must never delete. */
export const CLEANUP_PRESERVED_LEARNING_ENTITIES = [
  "categories",
  "user_hidden_categories",
  "category_classification_memory",
] as const;

export type CleanupFinanceCounts = {
  transactions: number;
  predictions: number;
  recurrences: number;
  accounts: number;
  goals: number;
  budgets: number;
  importBatches: number;
  balancesReset: number;
  familyIncluded: boolean;
};

export type CleanupFinanceResult =
  | { ok: true; counts: CleanupFinanceCounts }
  | { ok: false; message: string };

export type CleanupFinanceInput = {
  blocks: CleanupFinanceBlock[];
  familyId?: string | null;
  /** Required when blocks include "all". */
  confirmationPhrase?: string;
};

const EMPTY_COUNTS: CleanupFinanceCounts = {
  transactions: 0,
  predictions: 0,
  recurrences: 0,
  accounts: 0,
  goals: 0,
  budgets: 0,
  importBatches: 0,
  balancesReset: 0,
  familyIncluded: false,
};

export function isCleanupFinanceBlock(
  value: string,
): value is CleanupFinanceBlock {
  return (CLEANUP_BLOCKS as readonly string[]).includes(value);
}

export function normalizeCleanupBlocks(
  blocks: readonly string[],
): CleanupFinanceBlock[] | null {
  if (blocks.length === 0) return null;

  const unique = [...new Set(blocks)];
  if (!unique.every(isCleanupFinanceBlock)) return null;

  if (unique.includes("all")) {
    return ["all"];
  }

  return unique as CleanupFinanceBlock[];
}

export function requiresStrongCleanupConfirmation(
  blocks: readonly CleanupFinanceBlock[],
): boolean {
  return blocks.includes("all");
}

export function isValidCleanupAllConfirmation(phrase: string): boolean {
  return phrase.trim().toUpperCase() === CLEANUP_ALL_CONFIRMATION_PHRASE;
}

export function getCleanupFinanceValidationError(
  input: CleanupFinanceInput,
): string | null {
  const blocks = normalizeCleanupBlocks(input.blocks);

  if (!blocks) {
    return "Selecione ao menos um bloco válido para limpar.";
  }

  if (
    requiresStrongCleanupConfirmation(blocks) &&
    !isValidCleanupAllConfirmation(input.confirmationPhrase ?? "")
  ) {
    return `Para limpar tudo, digite ${CLEANUP_ALL_CONFIRMATION_PHRASE}.`;
  }

  return null;
}

function mapCounts(data: unknown): CleanupFinanceCounts {
  if (!data || typeof data !== "object") {
    return EMPTY_COUNTS;
  }

  const row = data as Record<string, unknown>;

  return {
    transactions: Number(row.transactions ?? 0),
    predictions: Number(row.predictions ?? 0),
    recurrences: Number(row.recurrences ?? 0),
    accounts: Number(row.accounts ?? 0),
    goals: Number(row.goals ?? 0),
    budgets: Number(row.budgets ?? 0),
    importBatches: Number(row.importBatches ?? 0),
    balancesReset: Number(row.balancesReset ?? 0),
    familyIncluded: Boolean(row.familyIncluded),
  };
}

export function formatCleanupSummary(counts: CleanupFinanceCounts): string {
  const parts: string[] = [];

  if (counts.transactions > 0) {
    parts.push(
      `${counts.transactions} ${
        counts.transactions === 1 ? "lançamento" : "lançamentos"
      }`,
    );
  }
  if (counts.predictions > 0) {
    parts.push(
      `${counts.predictions} ${
        counts.predictions === 1 ? "previsão" : "previsões"
      }`,
    );
  }
  if (counts.recurrences > 0) {
    parts.push(
      `${counts.recurrences} ${
        counts.recurrences === 1 ? "recorrência" : "recorrências"
      }`,
    );
  }
  if (counts.accounts > 0) {
    parts.push(
      `${counts.accounts} ${counts.accounts === 1 ? "conta" : "contas"}`,
    );
  }
  if (counts.goals > 0) {
    parts.push(
      `${counts.goals} ${counts.goals === 1 ? "meta" : "metas"}`,
    );
  }
  if (counts.budgets > 0) {
    parts.push(
      `${counts.budgets} ${
        counts.budgets === 1 ? "orçamento" : "orçamentos"
      }`,
    );
  }
  if (counts.importBatches > 0) {
    parts.push(
      `${counts.importBatches} ${
        counts.importBatches === 1
          ? "histórico de importação"
          : "históricos de importação"
      }`,
    );
  }
  if (counts.balancesReset > 0 && counts.accounts === 0) {
    parts.push(
      `${counts.balancesReset} ${
        counts.balancesReset === 1 ? "saldo zerado" : "saldos zerados"
      }`,
    );
  }

  if (parts.length === 0) {
    return "Nenhum dado financeiro encontrado para limpar.";
  }

  return `Removidos: ${parts.join(", ")}.`;
}

/**
 * Runs selective financial cleanup via atomic RPC.
 * Scope includes bank accounts and credit cards equally.
 * When wiping transactions/accounts, also clears import_batches
 * (and cascaded import_batch_rows) for those accounts.
 * Before deleting transactions, categorized descriptions are snapshotted into
 * category_classification_memory so import suggestions keep working.
 * Does not delete auth, profile, family graph, categories,
 * user_hidden_categories, or category_classification_memory.
 * Balance consistency: transactions-only wipe resets balances to 0;
 * accounts wipe deletes the accounts entirely.
 */
export async function cleanupFinanceData(
  supabase: SupabaseClient,
  input: CleanupFinanceInput,
): Promise<CleanupFinanceResult> {
  const validationError = getCleanupFinanceValidationError(input);

  if (validationError) {
    return { ok: false, message: validationError };
  }

  const blocks = normalizeCleanupBlocks(input.blocks)!;

  const { data, error } = await supabase.rpc("cleanup_finance_data", {
    p_blocks: blocks,
    p_family_id: input.familyId ?? null,
  });

  if (error) {
    console.error(error);
    return {
      ok: false,
      message: "Não foi possível limpar os dados financeiros.",
    };
  }

  const counts = mapCounts(data);

  notifyTransactionsChanged();
  notifyRecurrencesChanged();

  return { ok: true, counts };
}
