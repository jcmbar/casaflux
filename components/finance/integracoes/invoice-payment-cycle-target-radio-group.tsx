"use client";

import { cn } from "@/lib/utils";
import { FormInput } from "@/components/forms/form-controls";
import {
  formatFullBrDate,
  type CreditCardBillingConfig,
} from "@/lib/finance/credit-card-billing";
import type {
  InvoicePaymentCycleTarget,
  InvoicePaymentCycleTargetOption,
  InvoicePaymentCycleTargetSelection,
  InvoicePaymentCycleResolveContext,
} from "@/lib/integrations/invoice-payment/invoice-payment-cycle-target";
import {
  applyInvoicePaymentCycleTargetChange,
  applyInvoicePaymentDueDateChange,
  deriveInvoicePaymentSuggestionForDueDate,
} from "@/lib/integrations/invoice-payment/invoice-payment-cycle-target";
import type { InvoicePaymentAmountMatchRecommendation } from "@/lib/integrations/invoice-payment/recommend-invoice-payment-target-by-amount";
import { formatCurrency } from "@/lib/format";

export function InvoicePaymentCycleTargetRadioGroup({
  controlId,
  sourceLine,
  options,
  selection,
  onSelectionChange,
  onTargetChange,
  billingConfig = null,
  paymentDate = "",
  cycleContext = null,
  amountMatchRecommendation = { kind: "none", matches: [], message: null },
}: {
  /** Stable id for radio name / test ids. Prefer this over sourceLine. */
  controlId?: string | number;
  /** @deprecated Prefer controlId. Kept for import review compatibility. */
  sourceLine?: number;
  options: InvoicePaymentCycleTargetOption[];
  selection: InvoicePaymentCycleTargetSelection;
  /** Preferred: full selection update (due date as source of truth). */
  onSelectionChange?: (selection: InvoicePaymentCycleTargetSelection) => void;
  /** @deprecated Prefer onSelectionChange. */
  onTargetChange?: (target: InvoicePaymentCycleTarget) => void;
  billingConfig?: CreditCardBillingConfig | null;
  paymentDate?: string;
  cycleContext?: InvoicePaymentCycleResolveContext | null;
  amountMatchRecommendation?: InvoicePaymentAmountMatchRecommendation;
}) {
  const id = String(controlId ?? sourceLine ?? "default");

  const selectedDueDate = selection.targetDueDate?.slice(0, 10) ?? "";

  const derivedSuggestion =
    selectedDueDate && billingConfig && paymentDate
      ? deriveInvoicePaymentSuggestionForDueDate(
          selectedDueDate,
          billingConfig,
          paymentDate,
          cycleContext,
        )
      : null;

  const recommended = options.find((option) => option.recommended) ?? null;
  const recommendedSelected =
    Boolean(recommended?.dueDate) &&
    selectedDueDate === recommended?.dueDate?.slice(0, 10);

  function emitSelection(next: InvoicePaymentCycleTargetSelection) {
    if (onSelectionChange) {
      onSelectionChange(next);
      return;
    }
    if (onTargetChange) {
      onTargetChange(next.target);
    }
  }

  return (
    <fieldset
      className="space-y-3"
      data-testid={`invoice-cycle-target-${id}`}
    >
      <legend className="sr-only">
        Qual fatura recebe o crédito?
      </legend>

      <FormInput
        id={`invoice-due-target-${id}`}
        label="Vencimento da fatura"
        type="date"
        value={selectedDueDate}
        onChange={(event) =>
          emitSelection(
            applyInvoicePaymentDueDateChange(
              event.target.value,
              billingConfig,
              paymentDate,
              cycleContext,
            ),
          )
        }
        data-testid={`invoice-due-target-input-${id}`}
      />

      {selectedDueDate ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid={`invoice-due-target-derived-${id}`}
        >
          Fatura com vencimento em{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatFullBrDate(selectedDueDate)}
          </span>
          {derivedSuggestion === "previous"
            ? " · anterior"
            : derivedSuggestion === "current"
              ? " · atual"
              : derivedSuggestion === "future"
                ? " · futura"
                : null}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Informe o vencimento da fatura que este crédito deve quitar.
        </p>
      )}

      {recommended?.dueDate && !recommendedSelected ? (
        <button
          type="button"
          onClick={() =>
            emitSelection(
              applyInvoicePaymentCycleTargetChange(
                selection,
                recommended.target,
                recommended.dueDate,
                recommended.cycleId,
              ),
            )
          }
          className={cn(
            "text-left text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline",
          )}
          data-testid={`invoice-cycle-target-${recommended.target}-${id}`}
          data-selected="false"
          data-amount-known={recommended.amountKnown ? "true" : "false"}
          data-amount-match={
            amountMatchRecommendation.kind === "unique" ? "true" : "false"
          }
        >
          {amountMatchRecommendation.kind === "unique" &&
          amountMatchRecommendation.match.dueDate ===
            recommended.dueDate?.slice(0, 10)
            ? `Usar recomendada: ${formatCurrency(amountMatchRecommendation.match.amountDue)} · vence ${amountMatchRecommendation.match.dueDateLabel}`
            : `Usar recomendada: ${recommended.label.toLowerCase()}${
                recommended.dueDateLabel
                  ? ` · vence ${recommended.dueDateLabel}`
                  : ""
              }`}
        </button>
      ) : null}
    </fieldset>
  );
}
