import { describe, expect, it } from "vitest";

import { resolveDefaultAccountId } from "./user-ui-preferences";

describe("resolveDefaultAccountId", () => {
  it("prefers the favorite when it is postable", () => {
    expect(
      resolveDefaultAccountId({
        preferredId: "acc-b",
        postableAccountIds: ["acc-a", "acc-b", "acc-c"],
      }),
    ).toBe("acc-b");
  });

  it("falls back to the first postable account when favorite is missing", () => {
    expect(
      resolveDefaultAccountId({
        preferredId: "acc-gone",
        postableAccountIds: ["acc-a", "acc-b"],
      }),
    ).toBe("acc-a");
  });

  it("returns empty string when there are no postable accounts", () => {
    expect(
      resolveDefaultAccountId({
        preferredId: "acc-a",
        postableAccountIds: [],
      }),
    ).toBe("");
  });
});
