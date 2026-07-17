import { describe, expect, it } from "vitest";

import {
  filterForecastAccounts,
  filterRealAccounts,
  isForecastAccount,
  isRealAccount,
  type AccountMode,
} from "@/types/account";

function account(account_mode: AccountMode) {
  return { account_mode };
}

describe("account mode", () => {
  it("identifies real and forecast accounts", () => {
    expect(isRealAccount(account("real"))).toBe(true);
    expect(isRealAccount(account("forecast"))).toBe(false);
    expect(isForecastAccount(account("forecast"))).toBe(true);
    expect(isForecastAccount(account("real"))).toBe(false);
  });

  it("separates real and forecast accounts", () => {
    const accounts = [
      { id: "real-1", account_mode: "real" as const },
      { id: "forecast-1", account_mode: "forecast" as const },
      { id: "real-2", account_mode: "real" as const },
    ];

    expect(filterRealAccounts(accounts).map(({ id }) => id)).toEqual([
      "real-1",
      "real-2",
    ]);
    expect(filterForecastAccounts(accounts).map(({ id }) => id)).toEqual([
      "forecast-1",
    ]);
  });
});
