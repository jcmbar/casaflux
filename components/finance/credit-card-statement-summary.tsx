"use client";

import {
  formatFullBrDate,
  formatStatementPeriodLabel,
  getCreditCardBillingConfig,
  getCurrentStatementCycle,
  getStatementSettlement,
  isPaymentAttributedToStatementCycle,
  STATEMENT_STATUS_LABELS,
  type StatementCycle,
  type StatementStatus,
} from "@/lib/finance/credit-card-billing";
import { formatCurrency } from "@/lib/format";
import { getInvoicePaymentReconcileBadge } from "@/lib/finance/lancamentos-filters";
import { buildFaturasHref } from "@/lib/finance/card-statement-history";
import type { Account } from "@/types/account";
import type { Transaction } from "@/types/transaction";
import { cn } from "@/lib/utils";
import Link from "next/link";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_BADGE_CLASS: Record<StatementStatus, string> = {
  open: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  partial: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  paid: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
  overdue: "bg-rose-500/15 text-rose-900 dark:text-rose-100",
};

export function CreditCardStatementSummary({
  account,
  transactions,
  referenceDate = todayIsoDate(),
  cycle: cycleOverride,
  className,
  onPayInvoice,
  payInvoiceDisabled = false,
}: {
  account: Account;
  transactions: Array<
    Pick<
      Transaction,
      "amount" | "type" | "date" | "accountId" | "description"
    > & {
      statementCycleId?: string | null;
      invoicePaymentOrigin?: "manual" | "imported" | null;
      reconciledWithTransactionId?: string | null;
    }
  >;
  referenceDate?: string;
  /** When set, used instead of deriving the cycle from referenceDate. */
  cycle?: StatementCycle;
  className?: string;
  /** When provided, shows the "Pagar fatura" action for this statement. */
  onPayInvoice?: (context: {
    cycle: StatementCycle;
    remainingTotal: number;
    status: StatementStatus;
  }) => void;
  payInvoiceDisabled?: boolean;
}) {
  const config = getCreditCardBillingConfig(account);
  if (!config) {
    return (
      <p
        className={cn("text-xs text-muted-foreground", className)}
        data-testid={`card-statement-unconfigured-${account.id}`}
      >
        Defina fechamento e vencimento para ver a fatura atual.
      </p>
    );
  }

  const cycle =
    cycleOverride ?? getCurrentStatementCycle(config, referenceDate);
  const settlement = getStatementSettlement({
    accountId: account.id,
    config,
    cycle,
    transactions,
    referenceDate,
  });

  const reconcileBadges = transactions
    .filter((transaction) =>
      isPaymentAttributedToStatementCycle({
        transaction,
        accountId: account.id,
        cycle,
        config,
      }),
    )
    .map((transaction) =>
      getInvoicePaymentReconcileBadge({
        invoicePaymentOrigin: transaction.invoicePaymentOrigin,
        reconciledWithTransactionId: transaction.reconciledWithTransactionId,
      }),
    );

  const hasReconciledPayment = reconcileBadges.includes("reconciled");
  const hasManualPendingPayment = reconcileBadges.includes("manual_pending");
  const showReconcileNote = hasReconciledPayment || hasManualPendingPayment;

  return (
    <div
      className={cn(
        "rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2.5 text-sm",
        className,
      )}
      data-testid={`card-statement-summary-${account.id}`}
      data-cycle-id={cycle.cycleId}
      data-statement-status={settlement.status}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="font-medium text-violet-900 dark:text-violet-100">
            Fatura · {formatStatementPeriodLabel(cycle)}
          </p>
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
              STATUS_BADGE_CLASS[settlement.status],
            )}
            data-testid={`card-statement-status-${account.id}`}
          >
            {STATEMENT_STATUS_LABELS[settlement.status]}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildFaturasHref({
              accountId: account.id,
              cycleId: cycle.cycleId,
            })}
            className="rounded-md border border-violet-500/30 bg-background/80 px-2.5 py-1 text-xs font-medium text-violet-900 transition-colors hover:bg-violet-500/10 dark:text-violet-100"
            data-testid={`statement-history-link-${account.id}`}
          >
            Histórico
          </Link>
          {onPayInvoice ? (
            <button
              type="button"
              className="rounded-md border border-violet-500/30 bg-background/80 px-2.5 py-1 text-xs font-medium text-violet-900 transition-colors hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-100"
              disabled={payInvoiceDisabled || settlement.remainingTotal <= 0}
              onClick={() =>
                onPayInvoice({
                  cycle,
                  remainingTotal: settlement.remainingTotal,
                  status: settlement.status,
                })
              }
              data-testid={`pay-invoice-button-${account.id}`}
            >
              Pagar fatura
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Vence em {formatFullBrDate(cycle.dueDate)}
      </p>
      <dl className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
        <div className="flex items-baseline justify-between gap-2 sm:justify-start sm:gap-2">
          <dt className="text-muted-foreground">Despesas do ciclo</dt>
          <dd
            className="font-medium text-foreground tabular-nums"
            data-testid={`card-statement-cycle-total-${account.id}`}
          >
            {formatCurrency(settlement.cyclePurchasesTotal)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 sm:justify-start sm:gap-2">
          <dt className="text-muted-foreground">Total a pagar nesta fatura</dt>
          <dd
            className="font-semibold text-foreground tabular-nums"
            data-testid={`card-statement-amount-due-${account.id}`}
          >
            {formatCurrency(settlement.amountDueTotal)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 sm:justify-start sm:gap-2">
          <dt className="text-muted-foreground">Pago</dt>
          <dd
            className="font-medium text-foreground tabular-nums"
            data-testid={`card-statement-paid-${account.id}`}
          >
            {formatCurrency(settlement.paidTotal)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 sm:justify-start sm:gap-2">
          <dt className="text-muted-foreground">Restante</dt>
          <dd
            className="font-medium text-foreground tabular-nums"
            data-testid={`card-statement-remaining-${account.id}`}
          >
            {formatCurrency(settlement.remainingTotal)}
          </dd>
        </div>
      </dl>
      {settlement.rolledInPurchasesTotal > 0 ? (
        <p
          className="mt-1.5 text-[11px] text-muted-foreground"
          data-testid={`card-statement-rolled-in-note-${account.id}`}
        >
          Inclui {formatCurrency(settlement.rolledInPurchasesTotal)} na virada
          do fechamento (parcelas/lançamentos) além das despesas do ciclo — por
          isso o total a pagar pode ser maior.
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Despesas do ciclo somam só o período {formatStatementPeriodLabel(cycle)}.
          Neste caso, o total a pagar coincide com esse valor.
        </p>
      )}
      {showReconcileNote ? (
        <p
          className="mt-1.5 text-[11px] text-muted-foreground"
          data-testid={`card-statement-reconcile-note-${account.id}`}
          data-reconcile-status={
            hasReconciledPayment ? "reconciled" : "manual_pending"
          }
        >
          {hasReconciledPayment
            ? "Pagamento manual conciliado com importação — a fatura não conta em dobro."
            : "Há pagamento manual nesta fatura aguardando conciliação na próxima importação."}
        </p>
      ) : null}
    </div>
  );
}
