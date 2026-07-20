"use client";

import { FormSelect } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import { formatAccountSelectLabel } from "@/lib/finance/account-identity";
import { formatCurrency, formatDate } from "@/lib/format";
import type { InvoicePaymentImportMode } from "@/lib/integrations/invoice-payment/resolve-invoice-payment";
import type { ImportedInvoicePaymentResolution } from "@/lib/integrations/invoice-payment/resolve-invoice-payment";
import type {
  InvoicePaymentReconcileDecision,
  InvoicePaymentReconcileSuggestion,
} from "@/lib/integrations/invoice-payment/suggest-invoice-payment-reconcile";
import type { Account } from "@/types/account";
import type { ImportPreviewRow } from "@/lib/integrations/types";

export function InvoicePaymentImportPanel({
  row,
  cardName,
  resolution,
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
  mode: InvoicePaymentImportMode;
  sourceAccountId: string;
  checkingAccounts: Account[];
  onModeChange: (mode: InvoicePaymentImportMode) => void;
  onSourceAccountChange: (accountId: string) => void;
  reconcileSuggestion?: InvoicePaymentReconcileSuggestion | null;
  reconcileDecision?: InvoicePaymentReconcileDecision;
  onReconcileDecisionChange?: (decision: InvoicePaymentReconcileDecision) => void;
}) {
  return (
    <div
      className="mt-3 space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/5 px-3 py-3"
      data-testid={`invoice-payment-panel-${row.sourceLine}`}
    >
      <div>
        <p className="text-sm font-medium text-violet-900 dark:text-violet-100">
          Detectamos um possível pagamento de fatura
        </p>
        <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
          <li>
            Cartão: <span className="text-foreground">{cardName}</span>
          </li>
          <li>
            Valor:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatCurrency(row.amount)}
            </span>
          </li>
          <li>
            Data: <span className="text-foreground">{formatDate(row.date)}</span>
          </li>
          <li>
            Provável fatura quitada:{" "}
            <span className="text-foreground">
              {resolution
                ? `período ${resolution.periodLabel}, vencimento ${resolution.dueDateLabel}`
                : "configure fechamento/vencimento do cartão para inferir o ciclo"}
            </span>
          </li>
        </ul>
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
          label="Conta de origem do pagamento"
          value={sourceAccountId}
          onChange={(event) => onSourceAccountChange(event.target.value)}
          data-testid={`invoice-source-select-${row.sourceLine}`}
        >
          <option value="">Selecione a conta bancária de origem</option>
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

      {mode === "payment" && reconcileSuggestion && onReconcileDecisionChange ? (
        <div
          className="space-y-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5"
          data-testid={`invoice-reconcile-suggestion-${row.sourceLine}`}
          data-confidence={reconcileSuggestion.confidence}
        >
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            Encontramos um pagamento manual compatível para esta fatura
          </p>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            <li>{reconcileSuggestion.summary}</li>
            <li>
              Manual:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatCurrency(reconcileSuggestion.amount)}
              </span>{" "}
              em {formatDate(reconcileSuggestion.paymentDate)}
            </li>
            <li>
              Os dois registros serão mantidos e ligados — a fatura não conta o
              pagamento em dobro.
            </li>
          </ul>
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
          Nenhum pagamento manual compatível encontrado para conciliar.
        </p>
      ) : null}
    </div>
  );
}
