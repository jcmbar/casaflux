import { describe, expect, it } from "vitest";

import {
  MIN_PASSWORD_LENGTH,
  validateChangePassword,
} from "@/lib/auth/change-password";

describe("validateChangePassword", () => {
  it("requires current password", () => {
    const result = validateChangePassword({
      currentPassword: "",
      newPassword: "abcdef",
      confirmPassword: "abcdef",
    });
    expect(result).toEqual({
      ok: false,
      field: "currentPassword",
      message: "Informe a senha atual.",
    });
  });

  it("enforces minimum length", () => {
    const result = validateChangePassword({
      currentPassword: "oldpass",
      newPassword: "12345",
      confirmPassword: "12345",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("newPassword");
      expect(result.message).toContain(String(MIN_PASSWORD_LENGTH));
    }
  });

  it("requires confirmation match", () => {
    const result = validateChangePassword({
      currentPassword: "oldpass",
      newPassword: "abcdef",
      confirmPassword: "abcdeg",
    });
    expect(result).toEqual({
      ok: false,
      field: "confirmPassword",
      message: "A confirmação não coincide com a nova senha.",
    });
  });

  it("rejects same as current", () => {
    const result = validateChangePassword({
      currentPassword: "samepass",
      newPassword: "samepass",
      confirmPassword: "samepass",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("newPassword");
    }
  });

  it("accepts valid input", () => {
    expect(
      validateChangePassword({
        currentPassword: "oldpass",
        newPassword: "abcdef",
        confirmPassword: "abcdef",
      }),
    ).toEqual({ ok: true });
  });
});
