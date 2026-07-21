"use client";

import { cn } from "@/lib/utils";
import type {
  InvoicePaymentCycleTarget,
  InvoicePaymentCycleTargetOption,
  InvoicePaymentCycleTargetSelection,
} from "@/lib/integrations/invoice-payment/invoice-payment-cycle-target";
import {
  isInvoicePaymentCycleTargetChecked,
  parseInvoicePaymentCycleTargetValue,
} from "@/lib/integrations/invoice-payment/invoice-payment-cycle-target";

export function InvoicePaymentCycleTargetRadioGroup({
  sourceLine,
  options,
  selection,
  onTargetChange,
}: {
  sourceLine: number;
  options: InvoicePaymentCycleTargetOption[];
  selection: InvoicePaymentCycleTargetSelection;
  onTargetChange: (target: InvoicePaymentCycleTarget) => void;
}) {
  const groupName = `invoice-cycle-target-${sourceLine}`;

  return (
    <fieldset
      className="space-y-2"
      data-testid={`invoice-cycle-target-${sourceLine}`}
    >
      <legend className="text-xs font-medium text-foreground">
        Aplicar crédito em
      </legend>
      <div
        role="radiogroup"
        aria-label="Aplicar crédito em"
        className="space-y-1.5"
      >
        {options.map((option) => {
          const checked = isInvoicePaymentCycleTargetChecked(
            selection,
            option.target,
          );
          const detail =
            option.target === "future"
              ? option.hint
              : `${option.periodLabel} · vence ${option.dueDateLabel}`;

          return (
            <label
              key={option.target}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-xs transition-colors",
                checked
                  ? "border-violet-600/50 bg-violet-500/15 ring-1 ring-violet-500/25 dark:border-violet-400/50"
                  : "border-transparent hover:border-violet-500/20 hover:bg-violet-500/5",
              )}
              data-selected={checked ? "true" : "false"}
            >
              <input
                type="radio"
                name={groupName}
                value={option.target}
                checked={checked}
                onChange={(event) => {
                  const target = parseInvoicePaymentCycleTargetValue(
                    event.target.value,
                  );
                  if (target) {
                    onTargetChange(target);
                  }
                }}
                className="peer sr-only"
                data-testid={`invoice-cycle-target-${option.target}-${sourceLine}`}
                aria-checked={checked}
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  checked
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/45 bg-background",
                )}
                data-checked={checked ? "true" : "false"}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full bg-primary-foreground transition-opacity",
                    checked ? "opacity-100" : "opacity-0",
                  )}
                />
              </span>
              <span>
                <span
                  className={cn(
                    "font-medium",
                    checked ? "text-foreground" : "text-foreground/90",
                  )}
                >
                  {option.label}
                  {option.recommended ? " (recomendado)" : null}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block",
                    checked ? "text-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {detail}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
