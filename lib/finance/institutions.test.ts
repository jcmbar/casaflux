import { describe, expect, it } from "vitest";

import {
  normalizeInstitutionText,
  resolveAccountIdentity,
  resolveInstitutionFromName,
} from "./institutions";

describe("normalizeInstitutionText", () => {
  it("strips accents and lowercases", () => {
    expect(normalizeInstitutionText("  Itaú Unibanco  ")).toBe("itau unibanco");
  });
});

describe("resolveInstitutionFromName", () => {
  it("resolves mapped banks from common account names", () => {
    expect(resolveInstitutionFromName("Nubank").id).toBe("nubank");
    expect(resolveInstitutionFromName("Cartão Nubank Roxinho").id).toBe(
      "nubank",
    );
    expect(resolveInstitutionFromName("Itaú Personnalité").id).toBe("itau");
    expect(resolveInstitutionFromName("Banco Inter").id).toBe("inter");
    expect(resolveInstitutionFromName("Santander Free").id).toBe("santander");
    expect(resolveInstitutionFromName("Bradesco Prime").id).toBe("bradesco");
    expect(resolveInstitutionFromName("Caixa Econômica").id).toBe("caixa");
    expect(resolveInstitutionFromName("Banco do Brasil").id).toBe(
      "banco-do-brasil",
    );
    expect(resolveInstitutionFromName("C6 Bank").id).toBe("c6");
    expect(resolveInstitutionFromName("PicPay").id).toBe("picpay");
  });

  it("falls back to other for unmapped names", () => {
    expect(resolveInstitutionFromName("Carteira").id).toBe("other");
    expect(resolveInstitutionFromName("Conta corrente").id).toBe("other");
    expect(resolveInstitutionFromName("").id).toBe("other");
  });

  it("prefers longer alias matches over short tokens", () => {
    expect(resolveInstitutionFromName("Nubank").id).toBe("nubank");
    expect(resolveInstitutionFromName("BB Rendendo").id).toBe(
      "banco-do-brasil",
    );
  });
});

describe("resolveAccountIdentity", () => {
  it("uses institution logo metadata when available", () => {
    const identity = resolveAccountIdentity({
      name: "Nubank",
      type: "checking",
      color: null,
    });

    expect(identity.isKnownInstitution).toBe(true);
    expect(identity.hasLogo).toBe(true);
    expect(identity.institution.id).toBe("nubank");
    expect(identity.color).toBe("#820AD1");
    expect(identity.monogram).toBe("Nu");
  });

  it("prefers account color over brand color", () => {
    const identity = resolveAccountIdentity({
      name: "Nubank",
      color: "#112233",
    });

    expect(identity.color).toBe("#112233");
  });

  it("builds initials fallback for unknown institutions", () => {
    const identity = resolveAccountIdentity({
      name: "Carteira Casa",
      type: "cash",
      color: "#0f766e",
    });

    expect(identity.isKnownInstitution).toBe(false);
    expect(identity.hasLogo).toBe(false);
    expect(identity.monogram).toBe("CC");
    expect(identity.color).toBe("#0f766e");
  });

  it("uses monogram fallback for known banks without simple-icons logo", () => {
    const identity = resolveAccountIdentity({ name: "Itaú" });

    expect(identity.institution.id).toBe("itau");
    expect(identity.hasLogo).toBe(false);
    expect(identity.monogram).toBe("It");
    expect(identity.color).toBe("#EC7000");
  });
});
