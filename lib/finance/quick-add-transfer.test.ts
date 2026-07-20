import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createAccountTransfer,
  getTransferEligiblePostableAccounts,
} from "./account-transfer";
import {
  QUICK_ADD_TYPE_OPTIONS,
  buildQuickAddTransferInput,
  getQuickAddTransferAccountsUiState,
  isQuickAddTransferType,
  listQuickAddTransferAccounts,
  resolveQuickAddTransferAccounts,
} from "./quick-add-transfer";

describe("quick add transfer options", () => {
  it("exposes Transferência alongside receita and despesa", () => {
    expect(QUICK_ADD_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      "expense",
      "income",
      "transfer",
    ]);
    expect(
      QUICK_ADD_TYPE_OPTIONS.find((option) => option.value === "transfer")
        ?.label,
    ).toBe("Transferência");
    expect(isQuickAddTransferType("transfer")).toBe(true);
    expect(isQuickAddTransferType("expense")).toBe(false);
  });
});

describe("getQuickAddTransferAccountsUiState", () => {
  it("shows pickers when there are two or more eligible accounts", () => {
    expect(getQuickAddTransferAccountsUiState(2)).toEqual({
      showFromPicker: true,
      showToPicker: true,
      showNeedMoreAccountsMessage: false,
      canSubmitWithAccounts: true,
    });
  });

  it("keeps pickers visible with a blocking message when fewer than two", () => {
    expect(getQuickAddTransferAccountsUiState(1)).toEqual({
      showFromPicker: true,
      showToPicker: true,
      showNeedMoreAccountsMessage: true,
      canSubmitWithAccounts: false,
    });
    expect(getQuickAddTransferAccountsUiState(0)).toEqual({
      showFromPicker: false,
      showToPicker: false,
      showNeedMoreAccountsMessage: true,
      canSubmitWithAccounts: false,
    });
  });
});

describe("listQuickAddTransferAccounts", () => {
  it("reuses the same postable + type eligibility as the normal flow", () => {
    const accounts = [
      {
        id: "c1",
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
        id: "cash",
        type: "cash" as const,
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
        id: "other-user",
        type: "checking" as const,
        is_family_shared: false,
        allow_family_post: false,
        owner_user_id: "user-2",
      },
    ];

    const quickAddIds = listQuickAddTransferAccounts(accounts, "user-1").map(
      (a) => a.id,
    );
    const normalFlowIds = getTransferEligiblePostableAccounts(
      accounts,
      "user-1",
    ).map((a) => a.id);

    expect(quickAddIds).toEqual(["c1", "cash", "invest"]);
    expect(quickAddIds).toEqual(normalFlowIds);
  });
});

describe("resolveQuickAddTransferAccounts", () => {
  const accounts = [
    { id: "c1", type: "checking" as const },
    { id: "card", type: "credit_card" as const },
    { id: "cash", type: "cash" as const },
    { id: "invest", type: "investment" as const },
  ];

  it("ignores credit cards and picks distinct from/to including investment", () => {
    expect(
      resolveQuickAddTransferAccounts({
        accounts,
        fromAccountId: "",
        toAccountId: "",
      }),
    ).toEqual({ fromAccountId: "c1", toAccountId: "cash" });

    expect(
      resolveQuickAddTransferAccounts({
        accounts,
        fromAccountId: "invest",
        toAccountId: "c1",
      }),
    ).toEqual({ fromAccountId: "invest", toAccountId: "c1" });

    expect(
      resolveQuickAddTransferAccounts({
        accounts,
        fromAccountId: "cash",
        toAccountId: "cash",
      }),
    ).toEqual({ fromAccountId: "cash", toAccountId: "c1" });
  });

  it("allows selecting origin and destination independently when distinct", () => {
    expect(
      resolveQuickAddTransferAccounts({
        accounts,
        fromAccountId: "c1",
        toAccountId: "invest",
      }),
    ).toEqual({ fromAccountId: "c1", toAccountId: "invest" });
  });
});

describe("buildQuickAddTransferInput", () => {
  it("blocks origin equals destination", () => {
    const result = buildQuickAddTransferInput({
      fromAccountId: "a",
      toAccountId: "a",
      amountCents: 2500,
      transactionDate: "2026-07-20",
      description: "",
    });

    expect(result).toEqual({
      error: expect.stringMatching(/diferentes/i),
    });
  });

  it("builds the same payload shape used by createAccountTransfer", () => {
    const result = buildQuickAddTransferInput({
      fromAccountId: "from",
      toAccountId: "to",
      amountCents: 1990,
      transactionDate: "2026-07-20",
      description: " Reserva ",
    });

    expect(result).toEqual({
      fromAccountId: "from",
      toAccountId: "to",
      amount: 19.9,
      transactionDate: "2026-07-20",
      description: "Reserva",
    });
  });
});

describe("quick add transfer persistence reuse", () => {
  it("creates linked transfers through the shared RPC service", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        outTransactionId: "out-1",
        inTransactionId: "in-1",
        amount: 50,
        fromAccountId: "from",
        toAccountId: "to",
      },
      error: null,
    });

    const payload = buildQuickAddTransferInput({
      fromAccountId: "from",
      toAccountId: "to",
      amountCents: 5000,
      transactionDate: "2026-07-20",
      description: "",
    });

    expect("error" in payload).toBe(false);
    if ("error" in payload) return;

    const result = await createAccountTransfer(
      { rpc } as unknown as SupabaseClient,
      payload,
    );

    expect(rpc).toHaveBeenCalledWith("create_account_transfer", {
      p_from_account_id: "from",
      p_to_account_id: "to",
      p_amount: 50,
      p_transaction_date: "2026-07-20",
      p_description: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outTransactionId).toBe("out-1");
      expect(result.inTransactionId).toBe("in-1");
    }
  });
});
