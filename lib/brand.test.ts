import { describe, expect, it } from "vitest";

import {
  BRAND_COLOR,
  BRAND_MARKS,
  brandMarkForSurface,
  brandMarkSrc,
} from "./brand";

describe("CasaFlux brand system", () => {
  it("keeps the official brand teal", () => {
    expect(BRAND_COLOR).toBe("#0f766e");
  });

  it("maps compact surfaces to mark B", () => {
    expect(brandMarkForSurface("favicon")).toBe("compact");
    expect(brandMarkForSurface("app_icon")).toBe("compact");
    expect(brandMarkForSurface("sidebar_collapsed")).toBe("compact");
    expect(brandMarkForSurface("icon_only")).toBe("compact");
    expect(brandMarkSrc("compact")).toBe(BRAND_MARKS.compact);
  });

  it("maps institutional surfaces to mark A", () => {
    expect(brandMarkForSurface("sidebar_expanded")).toBe("institutional");
    expect(brandMarkForSurface("login")).toBe("institutional");
    expect(brandMarkForSurface("onboarding")).toBe("institutional");
    expect(brandMarkForSurface("header")).toBe("institutional");
    expect(brandMarkForSurface("mobile_nav")).toBe("institutional");
    expect(brandMarkSrc("institutional")).toBe(BRAND_MARKS.institutional);
  });

  it("keeps experimental mark available but out of surface defaults", () => {
    expect(BRAND_MARKS.experimental).toBe("/brand/mark-experimental.svg");
    const defaults = [
      brandMarkForSurface("favicon"),
      brandMarkForSurface("login"),
      brandMarkForSurface("sidebar_expanded"),
    ];
    expect(defaults.every((variant) => variant !== "experimental")).toBe(true);
  });
});
