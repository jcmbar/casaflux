"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Layers, Loader2, Receipt } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AccountIdentityMark } from "@/components/finance/account-identity";
import { InvoicePaymentCycleRetargetControl } from "@/components/finance/invoice-payment-cycle-retarget-control";
import { FormSelect } from "@/components/forms/form-controls";
import { PageIntro } from "@/components/layout/page-intro";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpcomingStatementDues } from "@/components/finance/dashboard/upcoming-bills";
import { useAppContext } from "@/contexts/app-context";
import { formatAccountSelectLabel } from "@/lib/finance/account-identity";
import {
  buildCardStatementHistory,
  buildCardStatementHistoryDetail,
  buildFaturasHref,
  FATURAS_LIST_FILTER_LABELS,
  FATURAS_LIST_FILTERS,
  filterCardStatementHistory,
  getFaturasListEmptyMessage,
  parseFaturasListFilter,
  STATEMENT_PAYMENT_DISPLAY_STATUS_LABELS,
  type CardStatementHistoryDetail,
  type CardStatementHistoryItem,
  type FaturasListFilter,
  type StatementPaymentDisplayStatus,
  type StatementPaymentSourceLookup,
} from "@/lib/finance/card-statement-history";
import {
  getCreditCardBillingConfig,
  type StatementStatus,
} from "@/lib/finance/credit-card-billing";
import {
  fetchCardStatementCyclesForAccount,
  type CardStatementCycleRecord,
} from "@/lib/finance/card-statement-cycles";
import {
  filterAccountsByFinanceScope,
  getFinanceViewScope,
} from "@/lib/finance/finance-scope";
import { fetchAllTransactionsForAccounts } from "@/lib/finance/fetch-transactions";
import {
  STATEMENT_COMPOSITION_GROUP_HINTS,
  STATEMENT_COMPOSITION_GROUP_LABELS,
  type StatementComposition,
  type StatementCompositionLine,
} from "@/lib/finance/statement-composition";
import { buildUpcomingStatementDues } from "@/lib/finance/upcoming-statement-dues";
import { TRANSACTIONS_SELECT } from "@/lib/finance/transactions-query";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Account } from "@/types/account";
import {
  mapTransaction,
  type Transaction,
  type TransactionRow,
} from "@/types/transaction";

const STATUS_BADGE_CLASS: Record<StatementStatus, string> = {
  open: "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  partial:
    "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  paid: "border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
  overdue: "border-rose-500/25 bg-rose-500/10 text-rose-900 dark:text-rose-100",
};

const PAYMENT_STATUS_CLASS: Record<StatementPaymentDisplayStatus, string> = {
  manual_pending:
    "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  imported:
    "border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200",
  reconciled:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function FaturasView() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando faturas…
        </div>
      }
    >
      <FaturasViewContent />
    </Suspense>
  );
}

function FaturasViewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient()!, []);
  const { user, activeFamily } = useAppContext();

  const accountIdFromUrl = searchParams.get("account") ?? "";
  const cycleIdFromUrl = searchParams.get("cycle") ?? "";
  const statusFilter = parseFaturasListFilter(searchParams.get("status"));

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [importedCyclesByAccountId, setImportedCyclesByAccountId] = useState<
    Record<string, CardStatementCycleRecord[]>
  >({});
  const [sourcesByTransactionId, setSourcesByTransactionId] = useState<
    Map<string, StatementPaymentSourceLookup>
  >(() => new Map());
  const [loading, setLoading] = useState(true);
  const referenceDate = useMemo(() => todayIsoDate(), []);

  const scope = useMemo(
    () =>
      user
        ? getFinanceViewScope({
            userId: user.id,
            activeFamilyId: activeFamily?.id ?? null,
          })
        : null,
    [activeFamily?.id, user],
  );

  const creditCards = useMemo(
    () =>
      scope
        ? filterAccountsByFinanceScope(accounts, scope).filter(
            (account) => account.type === "credit_card",
          )
        : [],
    [accounts, scope],
  );

  const selectedCard =
    creditCards.find((account) => account.id === accountIdFromUrl) ??
    creditCards[0] ??
    null;

  const importedCycles = selectedCard
    ? (importedCyclesByAccountId[selectedCard.id] ?? [])
    : [];

  const loadData = useCallback(async () => {
    if (!scope) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: accountsData, error: accountsError } = await supabase
      .from("accounts")
      .select("*, families (id, name, slug)")
      .order("name");

    if (accountsError) {
      console.error(accountsError);
      setLoading(false);
      return;
    }

    const nextAccounts = (accountsData ?? []) as Account[];
    setAccounts(nextAccounts);

    const scopedCards = filterAccountsByFinanceScope(nextAccounts, scope).filter(
      (account) => account.type === "credit_card",
    );

    if (scopedCards.length === 0) {
      setTransactions([]);
      setImportedCyclesByAccountId({});
      setSourcesByTransactionId(new Map());
      setLoading(false);
      return;
    }

    const card =
      scopedCards.find((account) => account.id === accountIdFromUrl) ??
      scopedCards[0] ??
      null;

    if (!card) {
      setTransactions([]);
      setImportedCyclesByAccountId({});
      setSourcesByTransactionId(new Map());
      setLoading(false);
      return;
    }

    if (!accountIdFromUrl || accountIdFromUrl !== card.id) {
      router.replace(
        buildFaturasHref({
          accountId: card.id,
          cycleId: cycleIdFromUrl || null,
          status: parseFaturasListFilter(searchParams.get("status")),
        }),
      );
    }

    const txResult = await fetchAllTransactionsForAccounts<TransactionRow>(
      supabase,
      {
        accountIds: scopedCards.map((item) => item.id),
        select: TRANSACTIONS_SELECT,
      },
    );

    if (txResult.error) {
      console.error(txResult.error);
      setTransactions([]);
      setImportedCyclesByAccountId({});
      setSourcesByTransactionId(new Map());
      setLoading(false);
      return;
    }

    const mapped = txResult.data.map(mapTransaction);
    setTransactions(mapped);

    const cyclesByAccount: Record<string, CardStatementCycleRecord[]> = {};
    await Promise.all(
      scopedCards.map(async (scopedCard) => {
        const cyclesResult = await fetchCardStatementCyclesForAccount(
          supabase,
          scopedCard.id,
        );
        if (cyclesResult.errorMessage) {
          console.error(cyclesResult.errorMessage);
          cyclesByAccount[scopedCard.id] = [];
          return;
        }
        cyclesByAccount[scopedCard.id] = cyclesResult.cycles;
      }),
    );
    setImportedCyclesByAccountId(cyclesByAccount);

    const linkedIds = [
      ...new Set(
        mapped
          .map((transaction) => transaction.linkedTransactionId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (linkedIds.length === 0) {
      setSourcesByTransactionId(new Map());
      setLoading(false);
      return;
    }

    const { data: linkedRows, error: linkedError } = await supabase
      .from("transactions")
      .select("id, account_id, notes, description, accounts ( id, name )")
      .in("id", linkedIds);

    if (linkedError) {
      console.error(linkedError);
      setSourcesByTransactionId(new Map());
      setLoading(false);
      return;
    }

    const sources = new Map<string, StatementPaymentSourceLookup>();
    for (const row of linkedRows ?? []) {
      const accountEmbed = Array.isArray(row.accounts)
        ? row.accounts[0]
        : row.accounts;
      sources.set(row.id as string, {
        accountId: row.account_id as string,
        accountName: accountEmbed?.name ?? null,
        notes: (row.notes as string | null) ?? null,
      });
    }
    setSourcesByTransactionId(sources);
    setLoading(false);
  }, [accountIdFromUrl, cycleIdFromUrl, router, scope, searchParams, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    function onTransactionsChanged() {
      void loadData();
    }

    window.addEventListener(
      "casaflux:transactions-changed",
      onTransactionsChanged,
    );
    return () => {
      window.removeEventListener(
        "casaflux:transactions-changed",
        onTransactionsChanged,
      );
    };
  }, [loadData]);

  const selectedCardTransactions = useMemo(
    () =>
      selectedCard
        ? transactions.filter(
            (transaction) => transaction.accountId === selectedCard.id,
          )
        : [],
    [selectedCard, transactions],
  );

  const history = useMemo(() => {
    if (!selectedCard) return null;
    return buildCardStatementHistory({
      cardAccount: selectedCard,
      transactions: selectedCardTransactions,
      referenceDate,
      importedCycles,
    });
  }, [importedCycles, referenceDate, selectedCard, selectedCardTransactions]);

  const detail = useMemo(() => {
    if (!selectedCard || !cycleIdFromUrl) return null;
    return buildCardStatementHistoryDetail({
      cardAccount: selectedCard,
      cycleId: cycleIdFromUrl,
      transactions: selectedCardTransactions,
      referenceDate,
      sourcesByTransactionId,
      importedCycles,
    });
  }, [
    cycleIdFromUrl,
    importedCycles,
    referenceDate,
    selectedCard,
    selectedCardTransactions,
    sourcesByTransactionId,
  ]);

  const upcomingDues = useMemo(
    () =>
      buildUpcomingStatementDues({
        cards: creditCards.map((account) => ({
          account,
          transactions: transactions.filter(
            (transaction) => transaction.accountId === account.id,
          ),
          importedCycles: importedCyclesByAccountId[account.id] ?? [],
        })),
        referenceDate,
        limit: 8,
      }),
    [creditCards, importedCyclesByAccountId, referenceDate, transactions],
  );

  const filteredHistory = useMemo(
    () => filterCardStatementHistory(history ?? [], statusFilter),
    [history, statusFilter],
  );

  function selectCard(nextAccountId: string) {
    router.push(
      buildFaturasHref({ accountId: nextAccountId, status: statusFilter }),
    );
  }

  function openCycle(cycleId: string) {
    if (!selectedCard) return;
    router.push(
      buildFaturasHref({
        accountId: selectedCard.id,
        cycleId,
        status: statusFilter,
      }),
    );
  }

  function closeDetail() {
    if (!selectedCard) return;
    router.push(
      buildFaturasHref({
        accountId: selectedCard.id,
        status: statusFilter,
      }),
    );
  }

  function setStatusFilter(next: FaturasListFilter) {
    if (!selectedCard) return;
    router.push(
      buildFaturasHref({
        accountId: selectedCard.id,
        status: next,
      }),
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageIntro description="Histórico de faturas do cartão: totais, status e pagamentos vinculados (manual, importado ou conciliado)." />

      {!detail ? (
        <UpcomingStatementDues
          loading={loading}
          items={upcomingDues}
          showSeeAll={false}
          description="Todas as faturas com saldo a pagar, de todos os cartões — da mais próxima para a mais distante."
        />
      ) : null}

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Cartão</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha o cartão. Faturas importadas usam fechamento e vencimento
              reais; dias fixos da conta são só fallback.
            </p>
          </div>
          {selectedCard ? (
            <Link
              href={`/lancamentos?account=${selectedCard.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              data-testid="faturas-open-lancamentos"
            >
              Ver lançamentos
            </Link>
          ) : null}
        </CardHeader>
        <CardContent>
          {loading && creditCards.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando cartões…
            </div>
          ) : creditCards.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="faturas-empty-cards"
            >
              Nenhum cartão de crédito encontrado. Crie um em Contas e importe
              uma fatura para começar.
            </p>
          ) : (
            <FormSelect
              id="faturas-card"
              label="Cartão de crédito"
              value={selectedCard?.id ?? ""}
              onChange={(event) => selectCard(event.target.value)}
              data-testid="faturas-card-select"
            >
              {creditCards.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountSelectLabel(account)}
                </option>
              ))}
            </FormSelect>
          )}
        </CardContent>
      </Card>

      {selectedCard && detail ? (
        <StatementDetail
          detail={detail}
          cardAccount={selectedCard}
          cardTransactions={selectedCardTransactions}
          importedCycles={importedCycles}
          onBack={closeDetail}
          onPaymentCycleUpdated={() => {
            void loadData();
          }}
        />
      ) : null}

      {selectedCard && !detail ? (
        <StatementList
          card={selectedCard}
          history={filteredHistory}
          hasAnyStatements={(history ?? []).length > 0}
          statusFilter={statusFilter}
          loading={loading}
          onOpenCycle={openCycle}
          onStatusFilterChange={setStatusFilter}
        />
      ) : null}
    </div>
  );
}

function StatementList({
  card,
  history,
  hasAnyStatements,
  statusFilter,
  loading,
  onOpenCycle,
  onStatusFilterChange,
}: {
  card: Account;
  history: CardStatementHistoryItem[];
  hasAnyStatements: boolean;
  statusFilter: FaturasListFilter;
  loading: boolean;
  onOpenCycle: (cycleId: string) => void;
  onStatusFilterChange: (filter: FaturasListFilter) => void;
}) {
  const emptyMessage = getFaturasListEmptyMessage({
    filter: statusFilter,
    hasAnyStatements,
  });

  return (
    <Card className="border-border/50 shadow-sm" data-testid="faturas-list">
      <CardHeader className="gap-4">
        <div className="flex items-start gap-3">
          <AccountIdentityMark account={card} size="md" />
          <div>
            <CardTitle className="text-base">Faturas · {card.name}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Ordem da mais recente para a mais antiga.
            </p>
          </div>
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Filtrar faturas por status"
          data-testid="faturas-status-filters"
        >
          {FATURAS_LIST_FILTERS.map((filter) => {
            const active = statusFilter === filter;
            return (
              <Button
                key={filter}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                role="tab"
                aria-selected={active}
                onClick={() => onStatusFilterChange(filter)}
                data-testid={`faturas-filter-${filter}`}
                data-active={active ? "true" : "false"}
              >
                {FATURAS_LIST_FILTER_LABELS[filter]}
              </Button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando faturas…
          </div>
        ) : history.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="faturas-empty-filter"
            data-filter={statusFilter}
          >
            {emptyMessage}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {history.map((item) => (
              <li key={item.cycle.cycleId}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-2 py-4 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => onOpenCycle(item.cycle.cycleId)}
                  data-testid={`fatura-row-${item.cycle.cycleId}`}
                  data-status={item.status}
                  data-current={item.isCurrent ? "true" : "false"}
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">
                        {item.periodLabel}
                      </p>
                      <Badge
                        variant="outline"
                        className={STATUS_BADGE_CLASS[item.status]}
                      >
                        {item.statusLabel}
                      </Badge>
                      {item.isCurrent ? (
                        <Badge
                          variant="outline"
                          className="border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200"
                        >
                          Atual
                        </Badge>
                      ) : null}
                      {item.usesImportedCycle ? (
                        <Badge
                          variant="outline"
                          className="border-sky-500/25 bg-sky-500/10 text-sky-900 dark:text-sky-100"
                          data-testid={`fatura-imported-${item.cycle.cycleId}`}
                        >
                          Importada
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Vence em {item.dueDateLabel}
                    </p>
                  </div>
                  <dl className="grid grid-cols-3 gap-3 text-xs sm:min-w-[280px]">
                    <div>
                      <dt className="text-muted-foreground">A pagar</dt>
                      <dd className="font-medium tabular-nums">
                        {formatCurrency(item.settlement.amountDueTotal)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Pago</dt>
                      <dd className="font-medium tabular-nums">
                        {formatCurrency(item.settlement.paidTotal)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Restante</dt>
                      <dd
                        className={cn(
                          "font-semibold tabular-nums",
                          item.settlement.remainingTotal > 0
                            ? "text-destructive"
                            : "text-primary",
                        )}
                      >
                        {formatCurrency(item.settlement.remainingTotal)}
                      </dd>
                    </div>
                  </dl>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StatementDetail({
  detail,
  cardAccount,
  cardTransactions,
  importedCycles = [],
  onBack,
  onPaymentCycleUpdated,
}: {
  detail: CardStatementHistoryDetail;
  cardAccount: Account;
  cardTransactions: Transaction[];
  importedCycles?: CardStatementCycleRecord[];
  onBack: () => void;
  onPaymentCycleUpdated: () => void;
}) {
  const [retargetPaymentId, setRetargetPaymentId] = useState<string | null>(
    null,
  );
  const billingConfig = getCreditCardBillingConfig(cardAccount);

  const settlementTransactions = useMemo(
    () =>
      cardTransactions
        .filter((item) => item.type === "income" || item.type === "expense")
        .map((item) => ({
          id: item.id,
          accountId: item.accountId,
          date: item.date,
          type: item.type as "income" | "expense",
          amount: item.amount,
          statementCycleId: item.statementCycleId,
          statementDueDate: item.statementDueDate ?? null,
          invoicePaymentOrigin: item.invoicePaymentOrigin ?? null,
          reconciledWithTransactionId:
            item.reconciledWithTransactionId ?? null,
        })),
    [cardTransactions],
  );

  return (
    <div className="space-y-4" data-testid="fatura-detail">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          data-testid="fatura-detail-back"
        >
          <ArrowLeft className="size-4" />
          Todas as faturas
        </Button>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">
                Fatura · {detail.periodLabel}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {detail.cardAccountName} · vence {detail.dueDateLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={STATUS_BADGE_CLASS[detail.status]}
                data-testid="fatura-detail-status"
              >
                {detail.statusLabel}
              </Badge>
              {detail.usesImportedCycle ? (
                <Badge
                  variant="outline"
                  className="border-sky-500/25 bg-sky-500/10 text-sky-900 dark:text-sky-100"
                  data-testid="fatura-detail-imported"
                >
                  Ciclo importado
                </Badge>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DetailMetric
              label="Despesas do ciclo"
              value={formatCurrency(detail.settlement.cyclePurchasesTotal)}
              testId="fatura-detail-cycle-purchases"
            />
            <DetailMetric
              label="Total a pagar nesta fatura"
              value={formatCurrency(detail.settlement.amountDueTotal)}
              testId="fatura-detail-amount-due"
            />
            <DetailMetric
              label="Total pago"
              value={formatCurrency(detail.settlement.paidTotal)}
              testId="fatura-detail-paid"
            />
            <DetailMetric
              label="Restante"
              value={formatCurrency(detail.settlement.remainingTotal)}
              testId="fatura-detail-remaining"
              emphasize={detail.settlement.remainingTotal > 0}
            />
          </dl>
        </CardContent>
      </Card>

      {detail.composition ? (
        <StatementCompositionCard composition={detail.composition} />
      ) : null}

      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4" />
            Pagamentos vinculados
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Pares conciliados aparecem uma vez, sem duplicar o valor pago.
          </p>
        </CardHeader>
        <CardContent>
          {detail.payments.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="fatura-detail-payments-empty"
            >
              Nenhum pagamento vinculado a esta fatura ainda.
            </p>
          ) : (
            <ul
              className="divide-y divide-border/60"
              data-testid="fatura-detail-payments"
            >
              {detail.payments.map((payment) => {
                const paymentTx = cardTransactions.find(
                  (item) => item.id === payment.id,
                );
                const canRetarget = Boolean(billingConfig && paymentTx);

                return (
                  <li
                    key={payment.id}
                    className="flex flex-col gap-2 py-3"
                    data-testid={`fatura-payment-${payment.id}`}
                    data-display-status={payment.displayStatus}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium tabular-nums">
                            {formatCurrency(payment.amount)}
                          </p>
                          <Badge
                            variant="outline"
                            className={
                              PAYMENT_STATUS_CLASS[payment.displayStatus]
                            }
                          >
                            {
                              STATEMENT_PAYMENT_DISPLAY_STATUS_LABELS[
                                payment.displayStatus
                              ]
                            }
                          </Badge>
                          {payment.origin ? (
                            <Badge
                              variant="outline"
                              className="text-muted-foreground"
                            >
                              {payment.origin === "manual"
                                ? "Origem manual"
                                : "Origem importada"}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(payment.date)}
                          {payment.sourceAccountName
                            ? ` · origem ${payment.sourceAccountName}`
                            : ""}
                        </p>
                        {payment.displayStatus === "reconciled" &&
                        payment.pairedOrigin ? (
                          <p className="text-xs text-muted-foreground">
                            Confirmado com o pagamento{" "}
                            {payment.pairedOrigin === "manual"
                              ? "manual"
                              : "importado"}{" "}
                            correspondente — ambos permanecem no histórico.
                          </p>
                        ) : null}
                        {payment.notes ? (
                          <p className="text-xs text-muted-foreground">
                            Obs.: {payment.notes}
                          </p>
                        ) : null}
                      </div>
                      {canRetarget ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setRetargetPaymentId((current) =>
                              current === payment.id ? null : payment.id,
                            )
                          }
                          data-testid={`fatura-payment-retarget-toggle-${payment.id}`}
                        >
                          {retargetPaymentId === payment.id
                            ? "Fechar ajuste"
                            : "Alterar fatura"}
                        </Button>
                      ) : null}
                    </div>

                    {retargetPaymentId === payment.id &&
                    billingConfig &&
                    paymentTx ? (
                      <InvoicePaymentCycleRetargetControl
                        transactionId={paymentTx.id}
                        paymentDate={paymentTx.date}
                        currentStatementCycleId={paymentTx.statementCycleId}
                        currentStatementDueDate={
                          paymentTx.statementDueDate ?? null
                        }
                        creditAmount={Math.abs(paymentTx.amount)}
                        billingConfig={billingConfig}
                        cardAccountId={cardAccount.id}
                        settlementTransactions={settlementTransactions}
                        importedCycles={importedCycles}
                        onUpdated={() => {
                          setRetargetPaymentId(null);
                          onPaymentCycleUpdated();
                        }}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatementCompositionCard({
  composition,
}: {
  composition: StatementComposition;
}) {
  return (
    <Card
      className="border-border/50 shadow-sm"
      data-testid="fatura-composition"
      data-has-rolled-in={composition.hasRolledIn ? "true" : "false"}
      data-cycle-only={composition.isCycleOnly ? "true" : "false"}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4" />
          Composição da fatura
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {composition.equationSummary}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl
          className="grid gap-2 rounded-lg border border-border/50 bg-muted/15 p-3 text-sm"
          data-testid="fatura-composition-summary"
        >
          <CompositionSummaryRow
            label={STATEMENT_COMPOSITION_GROUP_LABELS.cycle}
            value={composition.cyclePurchasesTotal}
            testId="fatura-composition-cycle-total"
          />
          {composition.hasRolledIn ? (
            <CompositionSummaryRow
              label={STATEMENT_COMPOSITION_GROUP_LABELS.rolled_in}
              value={composition.rolledInPurchasesTotal}
              testId="fatura-composition-rolled-in-total"
            />
          ) : null}
          <CompositionSummaryRow
            label="Total a pagar nesta fatura"
            value={composition.amountDueTotal}
            emphasize
            testId="fatura-composition-amount-due"
          />
        </dl>

        <CompositionGroup
          groupKey="cycle"
          total={composition.cyclePurchasesTotal}
          lines={composition.cycleLines}
        />

        {composition.hasRolledIn ? (
          <CompositionGroup
            groupKey="rolled_in"
            total={composition.rolledInPurchasesTotal}
            lines={composition.rolledInLines}
          />
        ) : (
          <p
            className="text-xs text-muted-foreground"
            data-testid="fatura-composition-no-rolled-in"
          >
            Nesta fatura, o total a pagar coincide com as despesas do ciclo —
            não há itens da virada do fechamento.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CompositionSummaryRow({
  label,
  value,
  emphasize = false,
  testId,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
  testId: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={cn(
          emphasize ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "tabular-nums",
          emphasize ? "text-base font-semibold" : "font-medium",
        )}
        data-testid={testId}
      >
        {formatCurrency(value)}
      </dd>
    </div>
  );
}

function CompositionGroup({
  groupKey,
  total,
  lines,
}: {
  groupKey: "cycle" | "rolled_in";
  total: number;
  lines: StatementCompositionLine[];
}) {
  return (
    <section
      className="space-y-2"
      data-testid={`fatura-composition-group-${groupKey}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">
            {STATEMENT_COMPOSITION_GROUP_LABELS[groupKey]}
          </h3>
          <p className="text-xs text-muted-foreground">
            {STATEMENT_COMPOSITION_GROUP_HINTS[groupKey]}
          </p>
        </div>
        <p className="text-sm font-semibold tabular-nums">
          {formatCurrency(total)}
        </p>
      </div>

      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum lançamento neste grupo.
        </p>
      ) : (
        <ul className="divide-y divide-border/50 rounded-lg border border-border/50">
          {lines.map((line) => (
            <li
              key={line.id}
              className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm"
              data-testid={`fatura-composition-line-${line.id}`}
              data-group={line.group}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{line.description}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(line.date)}
                </p>
              </div>
              <p className="shrink-0 font-medium tabular-nums">
                {formatCurrency(line.amount)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DetailMetric({
  label,
  value,
  testId,
  emphasize = false,
}: {
  label: string;
  value: string;
  testId: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          emphasize ? "text-destructive" : "text-foreground",
        )}
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}
