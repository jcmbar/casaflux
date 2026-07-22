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
import type { Account } from "@/types/account";
import type { ImportPreviewRow } from "@/lib/integrations/types";
import { InvoicePaymentCycleTargetRadioGroup } from "@/components/finance/integracoes/invoice-payment-cycle-target-radio-group";

export function InvoicePaymentImportPanel({
  row,
  cardName,
  resolution,
  cycleTargetOptions,
  dueDateOptions = [],
  cycleTargetSelection,
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

    const fromBucket =
      cycleTargetOptions.find((option) => option.recommended) ??
      cycleTargetOptions.find((option) => option.target === "previous") ??
      null;
    return fromBucket;
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

  return (
    <div
      className="mt-3 space-y-3 rounded-xl border border-border/60 bg-muted/15 px-3 py-3"
      data-testid={`invoice-payment-panel-${row.sourceLine}`}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          Possível pagamento de fatura
        </p>
        <p className="text-xs text-muted-foreground">
          {cardName}
          {recommendedOption ? (
            <>
              {" · "}
              <span data-testid={`invoice-suggestion-summary-${row.sourceLine}`}>
                sugestão: {recommendedOption.label.toLowerCase()}
                {recommendedOption.dueDateLabel
                  ? ` · vence ${recommendedOption.dueDateLabel}`
                  : ""}
              </span>
            </>
          ) : resolution ? (
            <> · sugestão: fatura anterior · vence {resolution.dueDateLabel}</>
          ) : null}
        </p>
        {suggestionConfidence ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid={`invoice-suggestion-confidence-${row.sourceLine}`}
            data-confidence={suggestionConfidence.confidence}
          >
            {suggestionConfidence.message}
          </p>
        ) : null}
        {!recommendedOption && !resolution ? (
          <p className="text-xs text-muted-foreground">
            Informe fechamento/vencimento do arquivo e o cartão para sugerir a
            fatura.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "payment" ? "default" : "outline"}
          onClick={() => onModeChange("payment")}
          data-testid={`invoice-payment-confirm-${row.sourceLine}`}
        >
          Confirmar como pagamento
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "common" ? "default" : "outline"}
          onClick={() => onModeChange("common")}
          data-testid={`invoice-payment-as-common-${row.sourceLine}`}
        >
          Manter como lançamento comum
        </Button>
      </div>

      {mode === "payment" ? (
        <FormSelect
          id={`invoice-source-${row.sourceLine}`}
          label="De onde saiu o pagamento?"
          value={sourceAccountId}
          onChange={(event) => onSourceAccountChange(event.target.value)}
          data-testid={`invoice-source-select-${row.sourceLine}`}
        >
          <option value="">Conta corrente de origem</option>
          {checkingAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {formatAccountSelectLabel(account)}
            </option>
          ))}
        </FormSelect>
      ) : (
        <p className="text-xs text-muted-foreground">
          Será importado como crédito no cartão, sem saída na conta corrente e
          sem vínculo de baixa de fatura.
        </p>
      )}

      {mode === "payment" && cycleTargetOptions.length > 0 ? (
        <InvoicePaymentCycleTargetRadioGroup
          sourceLine={row.sourceLine}
          options={cycleTargetOptions}
          selection={cycleTargetSelection}
          onSelectionChange={onCycleTargetSelectionChange}
          billingConfig={billingConfig}
          paymentDate={row.date}
          cycleContext={cycleContext}
        />
      ) : null}

      {mode === "payment" && cycleTargetImpact ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid={`invoice-cycle-impact-${row.sourceLine}`}
          data-target={cycleTargetSelection.target}
        >
          {cycleTargetImpact.highlight ? (
            <>
              {cycleTargetImpact.text.split(cycleTargetImpact.highlight)[0]}
              <span className="font-medium text-foreground">
                {cycleTargetImpact.highlight}
              </span>
              {cycleTargetImpact.text.split(cycleTargetImpact.highlight)[1]}
            </>
          ) : (
            cycleTargetImpact.text
          )}
        </p>
      ) : null}

      {mode === "payment" &&
      estimatedEffect &&
      selectedOption?.amountKnown &&
      selectedOption.amountDue != null ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid={`invoice-cycle-estimate-${row.sourceLine}`}
          data-target={estimatedEffect.target}
          data-remaining={estimatedEffect.remainingAfterCredit}
        >
          {estimatedEffect.text}
        </p>
      ) : null}

      {mode === "payment" && amountFeedback ? (
        <p
          className={
            amountFeedback.kind === "mismatch"
              ? "rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100"
              : "rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
          }
          data-testid={`invoice-amount-divergence-${row.sourceLine}`}
          data-feedback-kind={amountFeedback.kind}
          data-difference={amountFeedback.difference ?? undefined}
          data-target={cycleTargetSelection.target}
        >
          {amountFeedback.message}
        </p>
      ) : null}

      {mode === "payment" && reconcileSuggestion && onReconcileDecisionChange ? (
        <div
          className="space-y-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5"
          data-testid={`invoice-reconcile-suggestion-${row.sourceLine}`}
          data-confidence={reconcileSuggestion.confidence}
        >
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            Pagamento manual compatível encontrado
          </p>
          <p className="text-xs text-muted-foreground">
            {reconcileSuggestion.summary} ·{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatCurrency(reconcileSuggestion.amount)}
            </span>{" "}
            em {formatDate(reconcileSuggestion.paymentDate)}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
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

      {mode === "payment" &&
      sourceAccountId &&
      !reconcileSuggestion ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid={`invoice-reconcile-none-${row.sourceLine}`}
        >
          Nenhum pagamento manual compatível para conciliar.
        </p>
      ) : null}
    </div>
  );
}
