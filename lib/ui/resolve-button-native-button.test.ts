import { createElement } from "react";
import Link from "next/link";
import { describe, expect, it } from "vitest";

import { resolveButtonNativeButton } from "@/lib/ui/resolve-button-native-button";

describe("resolveButtonNativeButton", () => {
  it("defaults to native button when render is not used", () => {
    expect(resolveButtonNativeButton({})).toBe(true);
  });

  it("uses native button when render is a real button element", () => {
    expect(
      resolveButtonNativeButton({
        render: createElement("button", { type: "button" }),
      }),
    ).toBe(true);
  });

  it("uses non-native mode when render is a Link", () => {
    expect(
      resolveButtonNativeButton({
        render: createElement(Link, { href: "/lancamentos?new=1" }),
      }),
    ).toBe(false);
  });

  it("respects an explicit nativeButton override", () => {
    expect(
      resolveButtonNativeButton({
        render: createElement(Link, { href: "/lancamentos?new=1" }),
        nativeButton: true,
      }),
    ).toBe(true);

    expect(
      resolveButtonNativeButton({
        render: createElement("button", { type: "button" }),
        nativeButton: false,
      }),
    ).toBe(false);
  });
});
