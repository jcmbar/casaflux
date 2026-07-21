import { isValidElement, type ReactElement } from "react";
import type { Button as ButtonPrimitive } from "@base-ui/react/button";

export function resolveButtonNativeButton(input: {
  render?: ButtonPrimitive.Props["render"];
  nativeButton?: boolean;
}): boolean {
  if (input.nativeButton !== undefined) {
    return input.nativeButton;
  }

  if (!input.render) {
    return true;
  }

  if (typeof input.render === "function") {
    return false;
  }

  if (isValidElement(input.render)) {
    return isNativeButtonElement(input.render);
  }

  return false;
}

function isNativeButtonElement(element: ReactElement): boolean {
  return element.type === "button";
}
