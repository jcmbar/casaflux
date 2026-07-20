import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildTransferDescriptions,
  createAccountTransfer,
  deleteAccountTransfer,
  filterTransferEligibleAccounts,
  formatTransferAccountLabel,
  getCreateAccountTransferValidationError,
  getTransferEligiblePostableAccounts,
  isLinkedAccountTransfer,
  isTransferEligibleAccount,
  isTransferInDescription,
  isTransferOutDescription,
} from "./account-transfer";

describe("transfer eligibility", () => {
  it("allows all account types by default and blocks credit cards only", () => {
    expect(isTransferEligibleAccount({ type: "checking" })).toBe(true);
    expect(isTransferEligibleAccount({ type: "savings" })).toBe(true);
    expect(isTransferEligibleAccount({ type: "cash" })).toBe(true);
    expect(isTransferEligibleAccount({ type: "investment" })).toBe(true);
    expect(isTransferEligibleAccount({ type: "credit_card" })).toBe(false);
  });

  it("filters out credit cards and keeps previously excluded types", () => {
    const accounts = filterTransferEligibleAccounts([
      { type: "checking" as const },
      { type: "credit_card" as const },
      { type: "cash" as const },
      { type: "investment" as const },
    ]);
    expect(accounts.map((account) => account.type)).toEqual([
      "checking",
      "cash",
      "investment",
    ]);
  });

  it("getTransferEligiblePostableAccounts matches postable + type blocklist", () => {
    const accounts = [
      {
        id: "mine",
        type: "checking" as const,
        is_family_shared: false,
        allow_family_post: false,
        owner_user_id: "user-1",
      },
      {
        id: "card",
        type: "credit_card" as const,
        is_family_shared: false,
        allow_family_post: false,
        owner_user_id: "user-1",
      },
      {
        id: "invest",
        type: "investment" as const,
        is_family_shared: false,
        allow_family_post: false,
        owner_user_id: "user-1",
      },
      {
        id: "family-ok",
        type: "cash" as const,
        is_family_shared: true,
        allow_family_post: true,
        owner_user_id: "user-2",
      },
      {
        id: "family-blocked",
        type: "savings" as const,
        is_family_shared: true,
        allow_family_post: false,
        owner_user_id: "user-2",
      },
      {
        id: "other",
        type: "checking" as const,
        is_family_shared: false,
        allow_family_post: false,
        owner_user_id: "user-2",
      },
    ];

    expect(
      getTransferEligiblePostableAccounts(accounts, "user-1").map((a) => a.id),
    ).toEqual(["mine", "invest", "family-ok"]);
  });

  it("formatTransferAccountLabel includes type for clear selection", () => {
    expect(
      formatTransferAccountLabel({
        name: "Tesouro",
        type: "investment",
        is_family_shared: false,
      }),
    ).toBe("Tesouro · Investimento · pessoal");

    expect(
      formatTransferAccountLabel(
        {
          name: "Carteira",
          type: "cash",
          is_family_shared: true,
        },
        { includeScope: false },
      ),
    ).toBe("Carteira · Dinheiro");
  });
});

describe("getCreateAccountTransferValidationError", () => {
  it("blocks same origin and destination", () => {
    expect(
      getCreateAccountTransferValidationError({
        fromAccountId: "a",
        toAccountId: "a",
        amount: 10,
        transactionDate: "2026-07-20",
      }),
    ).toMatch(/diferentes/i);
  });

  it("blocks invalid amount", () => {
    expect(
      getCreateAccountTransferValidationError({
        fromAccountId: "a",
        toAccountId: "b",
        amount: 0,
        transactionDate: "2026-07-20",
      }),
    ).toMatch(/valor/i);
  });

  it("accepts a valid payload", () => {
    expect(
      getCreateAccountTransferValidationError({
        fromAccountId: "a",
        toAccountId: "b",
        amount: 50,
        transactionDate: "2026-07-20",
        description: "Reserva",
      }),
    ).toBeNull();
  });
});

describe("transfer descriptions", () => {
  it("builds out/in labels with optional note", () => {
    expect(
      buildTransferDescriptions({
        fromAccountName: "Nubank",
        toAccountName: "Carteira",
      }),
    ).toEqual({
      outDescription: "Transferência para Carteira",
      inDescription: "Transferência de Nubank",
    });

    expect(
      buildTransferDescriptions({
        fromAccountName: "Nubank",
        toAccountName: "Carteira",
        description: "Reserva",
      }),
    ).toEqual({
      outDescription: "Transferência para Carteira — Reserva",
      inDescription: "Transferência de Nubank — Reserva",
    });
  });

  it("detects out/in legs for list display", () => {
    expect(isTransferOutDescription("Transferência para Carteira")).toBe(true);
    expect(isTransferInDescription("Transferência de Nubank")).toBe(true);
    expect(
      isLinkedAccountTransfer({
        type: "transfer",
        linkedTransactionId: "other",
      }),
    ).toBe(true);
    expect(
      isLinkedAccountTransfer({ type: "transfer", linkedTransactionId: null }),
    ).toBe(false);
  });
});

describe("createAccountTransfer", () => {
  it("creates both legs via atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        outTransactionId: "out-1",
        inTransactionId: "in-1",
        amount: 100,
        fromAccountId: "from-1",
        toAccountId: "to-1",
      },
      error: null,
    });

    const result = await createAccountTransfer(
      { rpc } as unknown as SupabaseClient,
      {
        fromAccountId: "from-1",
        toAccountId: "to-1",
        amount: 100,
        transactionDate: "2026-07-20",
        description: "Poupança",
      },
    );

    expect(rpc).toHaveBeenCalledWith("create_account_transfer", {
      p_from_account_id: "from-1",
      p_to_account_id: "to-1",
      p_amount: 100,
      p_transaction_date: "2026-07-20",
      p_description: "Poupança",
    });
    expect(result).toEqual({
      ok: true,
      outTransactionId: "out-1",
      inTransactionId: "in-1",
      amount: 100,
      fromAccountId: "from-1",
      toAccountId: "to-1",
    });
  });

  it("does not call RPC when origin equals destination", async () => {
    const rpc = vi.fn();
    const result = await createAccountTransfer(
      { rpc } as unknown as SupabaseClient,
      {
        fromAccountId: "same",
        toAccountId: "same",
        amount: 10,
        transactionDate: "2026-07-20",
      },
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("maps RPC failures without partial success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Origin and destination must be different" },
    });

    const result = await createAccountTransfer(
      { rpc } as unknown as SupabaseClient,
      {
        fromAccountId: "a",
        toAccountId: "b",
        amount: 10,
        transactionDate: "2026-07-20",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/diferentes/i);
    }
  });

  it("maps credit-card RPC rejection to a clear message", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Transfers cannot include credit card accounts" },
    });

    const result = await createAccountTransfer(
      { rpc } as unknown as SupabaseClient,
      {
        fromAccountId: "checking",
        toAccountId: "card",
        amount: 10,
        transactionDate: "2026-07-20",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/cartão de crédito/i);
    }
  });

  it("creates transfers involving formerly excluded types like investment", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        outTransactionId: "out-1",
        inTransactionId: "in-1",
        amount: 100,
        fromAccountId: "checking",
        toAccountId: "invest",
      },
      error: null,
    });

    const result = await createAccountTransfer(
      { rpc } as unknown as SupabaseClient,
      {
        fromAccountId: "checking",
        toAccountId: "invest",
        amount: 100,
        transactionDate: "2026-07-20",
        description: "Aporte",
      },
    );

    expect(rpc).toHaveBeenCalledWith("create_account_transfer", {
      p_from_account_id: "checking",
      p_to_account_id: "invest",
      p_amount: 100,
      p_transaction_date: "2026-07-20",
      p_description: "Aporte",
    });
    expect(result.ok).toBe(true);
  });
});

describe("deleteAccountTransfer", () => {
  it("deletes both legs via atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        deletedOutTransactionId: "out-1",
        deletedInTransactionId: "in-1",
        amount: 40,
      },
      error: null,
    });

    const result = await deleteAccountTransfer(
      { rpc } as unknown as SupabaseClient,
      "out-1",
    );

    expect(rpc).toHaveBeenCalledWith("delete_account_transfer", {
      p_transaction_id: "out-1",
    });
    expect(result).toEqual({
      ok: true,
      deletedOutTransactionId: "out-1",
      deletedInTransactionId: "in-1",
      amount: 40,
    });
  });
});

describe("search tokens for transfers", () => {
  it("keeps transfer labels searchable via description builders", async () => {
    const { buildTransactionSearchIndex, filterTransactionsBySearch } =
      await import("./lancamentos-search");

    const descriptions = buildTransferDescriptions({
      fromAccountName: "Nubank",
      toAccountName: "Carteira",
      description: "Reserva",
    });

    const rows = [
      {
        id: "out",
        description: descriptions.outDescription,
        amount: 200,
        type: "transfer" as const,
        categoryId: null,
        accountId: "from",
        date: "2026-07-20",
      },
      {
        id: "in",
        description: descriptions.inDescription,
        amount: 200,
        type: "transfer" as const,
        categoryId: null,
        accountId: "to",
        date: "2026-07-20",
      },
    ];

    const index = buildTransactionSearchIndex(rows, {
      accountsById: new Map([
        ["from", { id: "from", name: "Nubank", type: "checking" }],
        ["to", { id: "to", name: "Carteira", type: "cash" }],
      ]),
      categoriesById: new Map(),
    });

    expect(
      filterTransactionsBySearch(rows, "transferencia", index).map((row) => row.id),
    ).toEqual(["out", "in"]);
    expect(
      filterTransactionsBySearch(rows, "carteira", index).map((row) => row.id),
    ).toContain("out");
    expect(
      filterTransactionsBySearch(rows, "reserva", index).map((row) => row.id),
    ).toEqual(["out", "in"]);
  });
});
