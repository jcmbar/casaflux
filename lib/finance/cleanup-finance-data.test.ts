import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  CLEANUP_ALL_CONFIRMATION_PHRASE,
  cleanupFinanceData,
  formatCleanupSummary,
  getCleanupFinanceValidationError,
  isValidCleanupAllConfirmation,
  normalizeCleanupBlocks,
  requiresStrongCleanupConfirmation,
} from "./cleanup-finance-data";

describe("normalizeCleanupBlocks", () => {
  it("accepts partial blocks and collapses all", () => {
    expect(normalizeCleanupBlocks(["transactions", "goals"])).toEqual([
      "transactions",
      "goals",
    ]);
    expect(
      normalizeCleanupBlocks(["transactions", "all", "budgets"]),
    ).toEqual(["all"]);
  });

  it("rejects empty or unknown blocks", () => {
    expect(normalizeCleanupBlocks([])).toBeNull();
    expect(normalizeCleanupBlocks(["transactions", "profile"])).toBeNull();
  });
});

describe("strong confirmation for Tudo", () => {
  it("requires the exact phrase only for the all block", () => {
    expect(requiresStrongCleanupConfirmation(["transactions"])).toBe(false);
    expect(requiresStrongCleanupConfirmation(["all"])).toBe(true);
    expect(isValidCleanupAllConfirmation("apagar tudo")).toBe(true);
    expect(isValidCleanupAllConfirmation("apagar")).toBe(false);
    expect(
      getCleanupFinanceValidationError({
        blocks: ["all"],
        confirmationPhrase: "nao",
      }),
    ).toBe(`Para limpar tudo, digite ${CLEANUP_ALL_CONFIRMATION_PHRASE}.`);
  });
});

describe("cleanupFinanceData", () => {
  it("runs a partial cleanup through the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        transactions: 2,
        predictions: 1,
        recurrences: 0,
        accounts: 0,
        goals: 0,
        budgets: 3,
        importBatches: 1,
        balancesReset: 2,
        familyIncluded: false,
      },
      error: null,
    });

    const result = await cleanupFinanceData(
      { rpc } as unknown as SupabaseClient,
      {
        blocks: ["transactions", "budgets"],
        familyId: null,
      },
    );

    expect(rpc).toHaveBeenCalledWith("cleanup_finance_data", {
      p_blocks: ["transactions", "budgets"],
      p_family_id: null,
    });
    expect(result).toEqual({
      ok: true,
      counts: {
        transactions: 2,
        predictions: 1,
        recurrences: 0,
        accounts: 0,
        goals: 0,
        budgets: 3,
        importBatches: 1,
        balancesReset: 2,
        familyIncluded: false,
      },
    });
    if (result.ok) {
      expect(formatCleanupSummary(result.counts)).toContain(
        "1 histórico de importação",
      );
    }
  });

  it("runs a full cleanup only with the confirmation phrase", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        transactions: 4,
        predictions: 2,
        recurrences: 1,
        accounts: 2,
        goals: 1,
        budgets: 1,
        importBatches: 2,
        balancesReset: 0,
        familyIncluded: true,
      },
      error: null,
    });

    const denied = await cleanupFinanceData(
      { rpc } as unknown as SupabaseClient,
      {
        blocks: ["all"],
        familyId: "family-1",
        confirmationPhrase: "errado",
      },
    );

    expect(denied.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();

    const result = await cleanupFinanceData(
      { rpc } as unknown as SupabaseClient,
      {
        blocks: ["all"],
        familyId: "family-1",
        confirmationPhrase: CLEANUP_ALL_CONFIRMATION_PHRASE,
      },
    );

    expect(rpc).toHaveBeenCalledWith("cleanup_finance_data", {
      p_blocks: ["all"],
      p_family_id: "family-1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.counts.familyIncluded).toBe(true);
      expect(result.counts.importBatches).toBe(2);
      expect(formatCleanupSummary(result.counts)).toContain("4 lançamentos");
      expect(formatCleanupSummary(result.counts)).toContain("2 contas");
      expect(formatCleanupSummary(result.counts)).toContain(
        "2 históricos de importação",
      );
    }
  });

  it("does not call the RPC when blocks are invalid (scope/payload guard)", async () => {
    const rpc = vi.fn();
    const result = await cleanupFinanceData(
      { rpc } as unknown as SupabaseClient,
      {
        blocks: ["auth" as never],
      },
    );

    expect(result).toEqual({
      ok: false,
      message: "Selecione ao menos um bloco válido para limpar.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("cleanup scope documentation", () => {
  it("treats credit-card wipe the same as bank accounts in client counts", () => {
    const summary = formatCleanupSummary({
      transactions: 3,
      predictions: 0,
      recurrences: 0,
      accounts: 0,
      goals: 0,
      budgets: 0,
      importBatches: 1,
      balancesReset: 2,
      familyIncluded: false,
    });

    expect(summary).toContain("3 lançamentos");
    expect(summary).toContain("2 saldos zerados");
    expect(summary).toContain("1 histórico de importação");
  });
});
