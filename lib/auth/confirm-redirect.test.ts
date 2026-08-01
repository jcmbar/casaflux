import { describe, expect, it } from "vitest";

import {
  resolveAuthConfirmRedirect,
  sanitizeAuthRedirectPath,
} from "@/lib/auth/confirm-redirect";

describe("sanitizeAuthRedirectPath", () => {
  it("keeps safe relative paths", () => {
    expect(sanitizeAuthRedirectPath("/set-password", "/login")).toBe(
      "/set-password",
    );
    expect(sanitizeAuthRedirectPath("/reset-password?x=1", "/login")).toBe(
      "/reset-password?x=1",
    );
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(sanitizeAuthRedirectPath("https://evil.test", "/login")).toBe(
      "/login",
    );
    expect(sanitizeAuthRedirectPath("//evil.test", "/login")).toBe("/login");
    expect(sanitizeAuthRedirectPath("login", "/login")).toBe("/login");
  });
});

describe("resolveAuthConfirmRedirect", () => {
  it("defaults recovery and invite to /set-password", () => {
    expect(
      resolveAuthConfirmRedirect({
        type: "recovery",
        redirectTo: null,
        next: null,
      }),
    ).toBe("/set-password");
    expect(
      resolveAuthConfirmRedirect({
        type: "invite",
        redirectTo: null,
        next: null,
      }),
    ).toBe("/set-password");
  });

  it("honors redirect_to when valid", () => {
    expect(
      resolveAuthConfirmRedirect({
        type: "recovery",
        redirectTo: "/set-password",
        next: "/dashboard",
      }),
    ).toBe("/set-password");
  });

  it("falls back when redirect_to is unsafe", () => {
    expect(
      resolveAuthConfirmRedirect({
        type: "recovery",
        redirectTo: "https://evil.test",
        next: null,
      }),
    ).toBe("/set-password");
  });
});
