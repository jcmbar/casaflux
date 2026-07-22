"use client";

import { useMemo } from "react";

import { FormSelect } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import { formatAccountSelectLabel } from "@/lib/finance/account-identity";
import {
  formatFullBrDate,
  type CreditCardBillingConfig,
} from "@/lib/finance/credit-card-billing";
import type { StatementSettlementTransaction } from "@/lib/finance/credit-card-billing";
import {
  buildInvoicePaymentMissingInvoiceFeedback,
  detectInvoicePaymentAmountDivergence,
} from "@/lib/finance/card-statement-cycles";
import { formatCurrency, formatDate } from "@/lib/format";
import { getInvoicePaymentCycleTargetEstimatedEffect } from "@/lib/integrations/invoice-payment/invoice-payment-cycle-estimate";
import {
  classifyImportedInvoicePaymentSuggestionConfidence,
} from "@/lib/integrations/invoice-payment/invoice-payment-suggestion-confidence";
import {
  getInvoicePaymentCycleTargetImpactMessage,
  type InvoicePaymentCycleResolveContext,
  type InvoicePaymentCycleTargetOption,
  type InvoicePaymentCycleTargetSelection,
  type InvoicePaymentDueDateOption,
  type InvoicePaymentFutureCycleOption,
} from "@/lib/integrations/invoice-payment/invoice-payment-cycle-target";
import type { InvoicePaymentImportMode } from "@/lib/integrations/invoice-payment/resolve-invoice-payment";
import type { ImportedInvoicePaymentResolution } from "@/lib/integrations/invoice-payment/resolve-invoice-payment";
import type {
  InvoicePaymentReconcileDecision,
  InvoicePaymentReconcileSuggestion,
} from "@/lib/integrations/invoice-payment/suggest-invoice-payment-reconcile";
import type { InvoicePaymentAmountMatchRecommendation } from "@/lib/integrations/invoice-payment/recommend-invoice-payment-target-by-amount";
import type { Account } from "@/types/account";
import type { ImportPreviewRow } from "@/lib/integrations/types";
import { InvoicePaymentCycleTargetRadioGroup } from "@/components/finance/integracoes/invoice-payment-cycle-target-radio-group";
import { cn } from "@/lib/utils";

function StepLabel({
  step,
  title,
}: {
  step: number;
  title: string;
}) {
  return (
    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <span className="inline-flex size-4 items-center justify-center rounded-full bg-muted text-[10px] tabular-nums">
        {step}
      </span>
      {title}
    </p>
  );
}

export function InvoicePaymentImportPanel({
  row,
  cardName,
  resolution,
  cycleTargetOptions,
  dueDateOptions = [],
  cycleTargetSelection,
  amountRecommendation = { kind: "none", matches: [], message: null },
  futureCycleOptions,
  onCycleTargetSelectionChange,
  billingConfig = null,
  cardAccountId = "",
  settlementTransactions = [],
  cycleContext = null,
  mode,
  sourceAccountId,
  checkingAccounts,
  onModeChange,
  onSourceAccountChange,
  reconcileSuggestion = null,
  reconcileDecision = "skip",
  onReconcileDecisionChange,
}: {
  row: ImportPreviewRow;
  cardName: string;
  resolution: ImportedInvoicePaymentResolution | null;
  cycleTargetOptions: InvoicePaymentCycleTargetOption[];
  dueDateOptions?: InvoicePaymentDueDateOption[];
  cycleTargetSelection: InvoicePaymentCycleTargetSelection;
  amountRecommendation?: InvoicePaymentAmountMatchRecommendation;
  futureCycleOptions: InvoicePaymentFutureCycleOption[];
  onCycleTargetSelectionChange: (
    selection: InvoicePaymentCycleTargetSelection,
  ) => void;
  billingConfig?: CreditCardBillingConfig | null;
  cardAccountId?: string;
  settlementTransactions?: StatementSettlementTransaction[];
  cycleContext?: InvoicePaymentCycleResolveContext | null;
  mode: InvoicePaymentImportMode;
  sourceAccountId: string;
  checkingAccounts: Account[];
  onModeChange: (mode: InvoicePaymentImportMode) => void;
  onSourceAccountChange: (accountId: string) => void;
  reconcileSuggestion?: InvoicePaymentReconcileSuggestion | null;
  reconcileDecision?: InvoicePaymentReconcileDecision;
  onReconcileDecisionChange?: (decision: InvoicePaymentReconcileDecision) => void;
}) {
  const selectedOption = useMemo(() => {
    const dueKey = cycleTargetSelection.targetDueDate?.slice(0, 10);
    if (dueKey && /^\d{4}-\d{2}-\d{2}$/.test(dueKey)) {
      const fromDue = dueDateOptions.find((option) => option.dueDate === dueKey);
      const fromBucket = cycleTargetOptions.find(
        (option) => option.dueDate === dueKey,
      );
      const suggestion = fromBucket?.target ?? fromDue?.suggestion ?? null;
      return {
        target: suggestion ?? cycleTargetSelection.target,
        label:
          suggestion === "previous"
            ? "Fatura anterior"
            : suggestion === "current"
              ? "Fatura atual"
              : suggestion === "future"
                ? "Fatura futura"
                : "Fatura escolhida",
        dueDateLabel:
          fromDue?.dueDateLabel ??
          fromBucket?.dueDateLabel ??
          formatFullBrDate(dueKey),
        amountDue: fromDue?.amountDue ?? fromBucket?.amountDue ?? null,
        amountKnown: Boolean(
          fromDue?.amountKnown || fromBucket?.amountKnown,
        ),
        summaryLine:
          fromDue?.summaryLine ??
          fromBucket?.summaryLine ??
          `vence em ${formatFullBrDate(dueKey)}`,
      };
    }

    if (cycleTargetSelection.target === "future") {
      const cycleId =
        cycleTargetSelection.futureCycleId ?? futureCycleOptions[0]?.cycleId;
      const future = futureCycleOptions.find((option) => option.cycleId === cycleId);
      if (future) {
        return {
          target: "future" as const,
          label: "Fatura futura",
          dueDateLabel: future.dueDateLabel,
          amountDue: future.amountDue,
          amountKnown: future.amountKnown,
          summaryLine: future.summaryLine,
        };
      }
    }

    return (
      cycleTargetOptions.find(
        (option) => option.target === cycleTargetSelection.target,
      ) ?? null
    );
  }, [
    cycleTargetOptions,
    cycleTargetSelection.futureCycleId,
    cycleTargetSelection.target,
    cycleTargetSelection.targetDueDate,
    dueDateOptions,
    futureCycleOptions,
  ]);

  const recommendedOption = useMemo(() => {
    const fromDue = dueDateOptions.find((option) => option.recommended);
    if (fromDue) {
      return {
        label:
          fromDue.suggestion === "current"
            ? "Fatura atual"
            : fromDue.suggestion === "future"
              ? "Fatura futura"
              : "Fatura anterior",
        summaryLine: fromDue.summaryLine,
        dueDateLabel: fromDue.dueDateLabel,
      };
    }

    return (
      cycleTargetOptions.find((option) => option.recommended) ??
      cycleTargetOptions.find((option) => option.target === "previous") ??
      null
    );
  }, [cycleTargetOptions, dueDateOptions]);

  const cycleTargetImpact = getInvoicePaymentCycleTargetImpactMessage({
    cycleTargetOptions,
    cycleTargetSelection,
    futureCycleOptions,
    dueDateOptions,
  });

  const estimatedEffect = useMemo(() => {
    if (!billingConfig || !cardAccountId || mode !== "payment") {
      return null;
    }

    return getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId,
      paymentDate: row.date,
      creditAmount: row.amount,
      cycleTargetSelection,
      transactions: settlementTransactions,
      context: cycleContext,
    });
  }, [
    billingConfig,
    cardAccountId,
    cycleContext,
    cycleTargetSelection,
    mode,
    row.amount,
    row.date,
    settlementTransactions,
  ]);

  const suggestionConfidence = useMemo(() => {
    if (!billingConfig || !cardAccountId || !resolution) {
      return null;
    }

    return classifyImportedInvoicePaymentSuggestionConfidence({
      billingConfig,
      cardAccountId,
      paymentDate: row.date,
      creditAmount: row.amount,
      transactions: settlementTransactions,
      context: cycleContext,
    });
  }, [
    billingConfig,
    cardAccountId,
    cycleContext,
    resolution,
    row.amount,
    row.date,
    settlementTransactions,
  ]);

  const amountFeedback = useMemo(() => {
    if (mode !== "payment") {
      return null;
    }

    const dueDateLabel = selectedOption?.dueDateLabel ?? null;
    const hasSelectedDueDate = Boolean(
      cycleTargetSelection.targetDueDate?.slice(0, 10) || dueDateLabel,
    );

    if (!hasSelectedDueDate) {
      return null;
    }

    const hasImportedInvoiceTotal =
      Boolean(selectedOption?.amountKnown) &&
      selectedOption?.amountDue != null;

    if (!hasImportedInvoiceTotal) {
      return buildInvoicePaymentMissingInvoiceFeedback({
        paymentAmount: row.amount,
        dueDateLabel,
      });
    }

    return detectInvoicePaymentAmountDivergence({
      paymentAmount: row.amount,
      expectedAmountDue: selectedOption!.amountDue!,
      dueDateLabel,
    });
  }, [
    cycleTargetSelection.targetDueDate,
    mode,
    row.amount,
    selectedOption,
  ]);

  const suggestionLine =
    amountRecommendation.kind === "unique"
      ? `recomendada · ${amountRecommendation.match.dueDateLabel}`
      : recommendedOption
        ? `${recommendedOption.label.toLowerCase()}${
            recommendedOption.dueDateLabel
              ? ` · ${recommendedOption.dueDateLabel}`
              : ""
          }`
        : resolution
          ? `anterior · ${resolution.dueDateLabel}`
          : null;

  return (
    <div
      className="space-y-2.5"
      data-testid={`invoice-payment-panel-${row.sourceLine}`}
    >
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-semibold tabular-nums">
            {formatCurrency(row.amount)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatDate(row.date)} · L{row.sourceLine}
          </p>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {cardName}
          {" · "}
          {row.description}
          {suggestionLine ? (
            <>
              {" · "}
              <span data-testid={`invoice-suggestion-summary-${row.sourceLine}`}>
                {suggestionLine}
              </span>
            </>
          ) : null}
          {suggestionConfidence ? (
            <>
              {" · "}
              <span
                data-testid={`invoice-suggestion-confidence-${row.sourceLine}`}
                data-confidence={suggestionConfidence.confidence}
              >
                {suggestionConfidence.message}
              </span>
            </>
          ) : null}
        </p>
      </div>

      {mode === "payment" ? (
        <>
          <div>
            <StepLabel step={1} title="Origem do pagamento" />
            <FormSelect
              id={`invoice-source-${row.sourceLine}`}
              label="Conta corrente"
              value={sourceAccountId}
              onChange={(event) => onSourceAccountChange(event.target.value)}
              data-testid={`invoice-source-select-${row.sourceLine}`}
            >
              <option value="">Selecione</option>
              {checkingAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountSelectLabel(account)}
                </option>
              ))}
            </FormSelect>
          </div>

          {cycleTargetOptions.length > 0 ? (
            <div>
              <StepLabel step={2} title="Fatura que recebe o crédito" />

              {amountRecommendation.kind === "unique" &&
              amountRecommendation.message ? (
                <div
                  className="mb-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-2"
                  data-testid={`invoice-amount-match-unique-${row.sourceLine}`}
                  data-due-date={amountRecommendation.match.dueDate}
                >
                  <p className="text-xs font-medium text-emerald-900 dark:text-emerald-100">
                    Fatura recomendada identificada
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {amountRecommendation.message}
                  </p>
                </div>
              ) : null}

              {amountRecommendation.kind === "ambiguous" &&
              amountRecommendation.message ? (
                <div
                  className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2"
                  data-testid={`invoice-amount-match-ambiguous-${row.sourceLine}`}
                  data-match-count={amountRecommendation.matches.length}
                >
                  <p className="text-xs font-medium text-amber-950 dark:text-amber-100">
                    Mais de uma fatura compatível
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {amountRecommendation.message}
                  </p>
                </div>
              ) : null}

              <InvoicePaymentCycleTargetRadioGroup
                sourceLine={row.sourceLine}
                options={cycleTargetOptions}
                selection={cycleTargetSelection}
                onSelectionChange={onCycleTargetSelectionChange}
                billingConfig={billingConfig}
                paymentDate={row.date}
                cycleContext={cycleContext}
                amountMatchRecommendation={amountRecommendation}
              />

              <div className="mt-2 space-y-1.5">
                {cycleTargetImpact ? (
                  <p
                    className="text-[11px] text-muted-foreground"
                    data-testid={`invoice-cycle-impact-${row.sourceLine}`}
                    data-target={cycleTargetSelection.target}
                  >
                    {cycleTargetImpact.highlight ? (
                      <>
                        {
                          cycleTargetImpact.text.split(
                            cycleTargetImpact.highlight,
                          )[0]
                        }
                        <span className="font-medium text-foreground">
                          {cycleTargetImpact.highlight}
                        </span>
                        {
                          cycleTargetImpact.text.split(
                            cycleTargetImpact.highlight,
                          )[1]
                        }
                      </>
                    ) : (
                      cycleTargetImpact.text
                    )}
                  </p>
                ) : null}

                {estimatedEffect &&
                selectedOption?.amountKnown &&
                selectedOption.amountDue != null ? (
                  <p
                    className="text-[11px] text-muted-foreground"
                    data-testid={`invoice-cycle-estimate-${row.sourceLine}`}
                    data-target={estimatedEffect.target}
                    data-remaining={estimatedEffect.remainingAfterCredit}
                  >
                    {estimatedEffect.text}
                  </p>
                ) : null}

                {amountFeedback ? (
                  <p
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-[11px] leading-snug",
                      amountFeedback.kind === "mismatch"
                        ? "border border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                        : "border border-border/50 bg-muted/20 text-muted-foreground",
                    )}
                    data-testid={`invoice-amount-divergence-${row.sourceLine}`}
                    data-feedback-kind={amountFeedback.kind}
                    data-difference={amountFeedback.difference ?? undefined}
                    data-target={cycleTargetSelection.target}
                  >
                    {amountFeedback.message}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {reconcileSuggestion && onReconcileDecisionChange ? (
            <div
              className="space-y-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-2"
              data-testid={`invoice-reconcile-suggestion-${row.sourceLine}`}
              data-confidence={reconcileSuggestion.confidence}
            >
              <p className="text-xs font-medium text-emerald-900 dark:text-emerald-100">
                Pagamento manual compatível
              </p>
              <p className="text-[11px] text-muted-foreground">
                {reconcileSuggestion.summary} ·{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatCurrency(reconcileSuggestion.amount)}
                </span>{" "}
                em {formatDate(reconcileSuggestion.paymentDate)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={reconcileDecision === "link" ? "default" : "outline"}
                  onClick={() => onReconcileDecisionChange("link")}
                  data-testid={`invoice-reconcile-link-${row.sourceLine}`}
                >
                  Conciliar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={reconcileDecision === "skip" ? "default" : "outline"}
                  onClick={() => onReconcileDecisionChange("skip")}
                  data-testid={`invoice-reconcile-skip-${row.sourceLine}`}
                >
                  Não conciliar
                </Button>
              </div>
            </div>
          ) : null}

          {sourceAccountId && !reconcileSuggestion ? (
            <p
              className="text-[11px] text-muted-foreground"
              data-testid={`invoice-reconcile-none-${row.sourceLine}`}
            >
              Sem pagamento manual compatível.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Crédito no cartão, sem saída na conta corrente nem baixa de fatura.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 border-t border-border/30 pt-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "payment" ? "default" : "outline"}
          onClick={() => onModeChange("payment")}
          data-testid={`invoice-payment-confirm-${row.sourceLine}`}
        >
          Como pagamento
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "common" ? "default" : "outline"}
          onClick={() => onModeChange("common")}
          data-testid={`invoice-payment-as-common-${row.sourceLine}`}
        >
          Lançamento comum
        </Button>
      </div>
    </div>
  );
}
