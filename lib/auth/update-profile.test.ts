import { describe, expect, it } from "vitest";

import { validateEmailChange } from "@/lib/auth/change-email";
import {
  MAX_FULL_NAME_LENGTH,
  validateFullName,
} from "@/lib/auth/update-profile";

describe("validateFullName", () => {
  it("rejects empty", () => {
    expect(validateFullName("   ")).toEqual({
      ok: false,
      message: "Informe um nome.",
    });
  });

  it("trims and collapses spaces", () => {
    expect(validateFullName("  Ana   Silva  ")).toEqual({
      ok: true,
      fullName: "Ana Silva",
    });
  });

  it("enforces max length", () => {
    const result = validateFullName("a".repeat(MAX_FULL_NAME_LENGTH + 1));
    expect(result.ok).toBe(false);
  });
});

describe("validateEmailChange", () => {
  it("rejects invalid format", () => {
    expect(validateEmailChange("not-an-email", "a@b.com").ok).toBe(false);
  });

  it("rejects same as current (case-insensitive)", () => {
    expect(validateEmailChange("A@B.com", "a@b.com")).toEqual({
      ok: false,
      message: "O novo e-mail deve ser diferente do atual.",
    });
  });

  it("accepts a new valid email", () => {
    expect(validateEmailChange(" Novo@Exemplo.com ", "a@b.com")).toEqual({
      ok: true,
      pendingEmail: "novo@exemplo.com",
    });
  });
});
