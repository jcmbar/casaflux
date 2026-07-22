"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { useConfirm } from "@/components/feedback/confirm-dialog-provider";
import { InvoicePaymentCycleTargetRadioGroup } from "@/components/finance/integracoes/invoice-payment-cycle-target-radio-group";
import { Button } from "@/components/ui/button";
import type { CreditCardBillingConfig } from "@/lib/finance/credit-card-billing";
import type { StatementSettlementTransaction } from "@/lib/finance/credit-card-billing";
import type { CardStatementCycleRecord } from "@/lib/finance/card-statement-cycles";
import { updateInvoicePaymentCycle } from "@/lib/finance/update-invoice-payment-cycle";
import { getInvoicePaymentCycleTargetEstimatedEffect } from "@/lib/integrations/invoice-payment/invoice-payment-cycle-estimate";
import {
  buildInvoicePaymentCycleTargetOptions,
  buildInvoicePaymentDueDateOptions,
  buildInvoicePaymentFutureCycleOptions,
  getInvoicePaymentCycleTargetImpactMessage,
  inferInvoicePaymentCycleTargetSelection,
  type InvoicePaymentCycleResolveContext,
  type InvoicePaymentCycleTargetSelection,
} from "@/lib/integrations/invoice-payment/invoice-payment-cycle-target";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";

export function InvoicePaymentCycleRetargetControl({
  transactionId,
  paymentDate,
  currentStatementCycleId,
  currentStatementDueDate = null,
  creditAmount,
  billingConfig,
  cardAccountId,
  settlementTransactions = [],
  importedCycles = [],
  onUpdated,
}: {
  transactionId: string;
  paymentDate: string;
  currentStatementCycleId: string | null;
  currentStatementDueDate?: string | null;
  creditAmount: number;
  billingConfig: CreditCardBillingConfig;
  cardAccountId: string;
  settlementTransactions?: Array<
    StatementSettlementTransaction & { id?: string }
  >;
  importedCycles?: readonly CardStatementCycleRecord[];
  onUpdated?: (result: {
    statementCycleId: string;
    statementDueDate: string;
  }) => void;
}) {
  const confirm = useConfirm();
  const supabase = useMemo(() => createClient()!, []);
  const cycleContext = useMemo(
    (): InvoicePaymentCycleResolveContext => ({
      importedCycles,
    }),
    [importedCycles],
  );

  const [selection, setSelection] = useState<InvoicePaymentCycleTargetSelection>(
    () =>
      inferInvoicePaymentCycleTargetSelection(
        billingConfig,
        paymentDate,
        currentStatementCycleId,
        cycleContext,
        currentStatementDueDate,
      ),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelection(
      inferInvoicePaymentCycleTargetSelection(
        billingConfig,
        paymentDate,
        currentStatementCycleId,
        cycleContext,
        currentStatementDueDate,
      ),
    );
  }, [
    billingConfig,
    currentStatementCycleId,
    currentStatementDueDate,
    cycleContext,
    paymentDate,
    transactionId,
  ]);

  const cycleTargetOptions = useMemo(
    () =>
      buildInvoicePaymentCycleTargetOptions(
        billingConfig,
        paymentDate,
        cycleContext,
      ),
    [billingConfig, cycleContext, paymentDate],
  );
  const futureCycleOptions = useMemo(
    () =>
      buildInvoicePaymentFutureCycleOptions(
        billingConfig,
        paymentDate,
        6,
        cycleContext,
      ),
    [billingConfig, cycleContext, paymentDate],
  );
  const dueDateOptions = useMemo(
    () =>
      buildInvoicePaymentDueDateOptions(
        billingConfig,
        paymentDate,
        cycleContext,
      ),
    [billingConfig, cycleContext, paymentDate],
  );

  const initialSelection = useMemo(
    () =>
      inferInvoicePaymentCycleTargetSelection(
        billingConfig,
        paymentDate,
        currentStatementCycleId,
        cycleContext,
        currentStatementDueDate,
      ),
    [
      billingConfig,
      currentStatementCycleId,
      currentStatementDueDate,
      cycleContext,
      paymentDate,
    ],
  );

  const dirty =
    selection.targetDueDate !== initialSelection.targetDueDate ||
    selection.target !== initialSelection.target ||
    (selection.futureCycleId ?? "") !== (initialSelection.futureCycleId ?? "");

  const impact = getInvoicePaymentCycleTargetImpactMessage({
    cycleTargetOptions,
    cycleTargetSelection: selection,
    futureCycleOptions,
    dueDateOptions,
  });

  const estimatedEffect = useMemo(() => {
    const txsWithoutThisPayment = settlementTransactions.filter(
      (transaction) => transaction.id !== transactionId,
    );

    return getInvoicePaymentCycleTargetEstimatedEffect({
      billingConfig,
      cardAccountId,
      paymentDate,
      creditAmount: Math.abs(creditAmount),
      cycleTargetSelection: selection,
      transactions: txsWithoutThisPayment,
      context: cycleContext,
    });
  }, [
    billingConfig,
    cardAccountId,
    creditAmount,
    cycleContext,
    paymentDate,
    selection,
    settlementTransactions,
    transactionId,
  ]);

  async function handleSave() {
    if (!dirty) {
      return;
    }

    const confirmed = await confirm({
      title: "Alterar destino do pagamento",
      description: [
        impact?.text,
        estimatedEffect?.text ?? null,
        "Listas, badges e totais das faturas afetadas serão recalculados.",
      ]
        .filter(Boolean)
        .join(" "),
      confirmLabel: "Salvar destino",
      cancelLabel: "Cancelar",
    });

    if (!confirmed) {
      return;
    }

    setSaving(true);
    const result = await updateInvoicePaymentCycle(supabase, {
      transactionId,
      selection,
      billingConfig,
      context: cycleContext,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success("Destino do pagamento atualizado.");
    onUpdated?.({
      statementCycleId: result.statementCycleId,
      statementDueDate: result.statementDueDate,
    });
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/5 px-3 py-3"
      data-testid={`invoice-payment-cycle-retarget-${transactionId}`}
    >
      <div>
        <p className="text-sm font-medium text-violet-900 dark:text-violet-100">
          Destino do pagamento de fatura
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Escolha a fatura pelo vencimento. Corrija se o crédito foi aplicado na
          fatura errada na importação ou no pagamento manual.
        </p>
      </div>

      <InvoicePaymentCycleTargetRadioGroup
        controlId={transactionId}
        options={cycleTargetOptions}
        selection={selection}
        onSelectionChange={setSelection}
        billingConfig={billingConfig}
        paymentDate={paymentDate}
        cycleContext={cycleContext}
      />

      {impact ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid={`invoice-retarget-impact-${transactionId}`}
        >
          {impact.highlight ? (
            <>
              {impact.text.split(impact.highlight)[0]}
              <span className="font-medium text-foreground">
                {impact.highlight}
              </span>
              {impact.text.split(impact.highlight)[1]}
            </>
          ) : (
            impact.text
          )}
        </p>
      ) : null}

      {estimatedEffect ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid={`invoice-retarget-estimate-${transactionId}`}
          data-remaining={estimatedEffect.remainingAfterCredit}
        >
          {estimatedEffect.text}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        disabled={!dirty || saving}
        onClick={() => void handleSave()}
        data-testid={`invoice-retarget-save-${transactionId}`}
      >
        {saving ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Salvando...
          </>
        ) : (
          "Salvar destino da fatura"
        )}
      </Button>
    </div>
  );
}
