"use client";

import { forwardRef, type ChangeEvent } from "react";

import {
  formatCentsDisplay,
  parseDigitsToCents,
} from "@/lib/finance/currency-input";
import { cn } from "@/lib/utils";

type CurrencyInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "type" | "inputMode"
> & {
  valueCents: number;
  onValueCentsChange: (cents: number) => void;
};

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput(
    { valueCents, onValueCentsChange, className, placeholder = "0,00", ...props },
    ref,
  ) {
    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      onValueCentsChange(parseDigitsToCents(event.target.value));
    }

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={valueCents > 0 ? formatCentsDisplay(valueCents) : ""}
        onChange={handleChange}
        className={cn(className)}
        {...props}
      />
    );
  },
);
