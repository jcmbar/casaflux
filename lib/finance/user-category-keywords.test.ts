import { describe, expect, it } from "vitest";

import {
  normalizeCategoryKeyword,
  normalizeCategoryKeywordList,
} from "./user-category-keywords";

describe("normalizeCategoryKeyword", () => {
  it("strips accents and lowercases", () => {
    expect(normalizeCategoryKeyword("Farmácia")).toBe("farmacia");
    expect(normalizeCategoryKeyword("  DROGASIL ")).toBe("drogasil");
  });

  it("rejects short tokens", () => {
    expect(normalizeCategoryKeyword("ab")).toBeNull();
    expect(normalizeCategoryKeyword("")).toBeNull();
  });
});

describe("normalizeCategoryKeywordList", () => {
  it("dedupes and caps length", () => {
    expect(
      normalizeCategoryKeywordList([
        "Drogasil",
        "drogasil",
        "Farmácia",
        "ab",
        "Drogaria Sao Paulo",
      ]),
    ).toEqual(["drogasil", "farmacia", "drogaria sao paulo"]);
  });
});
