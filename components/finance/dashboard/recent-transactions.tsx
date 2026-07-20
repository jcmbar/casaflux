import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Loader2,
} from "lucide-react";

import { AccountIdentityMark } from "@/components/finance/account-identity";
import { DashboardPanelHeader } from "@/components/finance/dashboard/dashboard-panel-header";
import { DashboardPanel } from "@/components/finance/dashboard/dashboard-panel";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import type { RecentTransactionItem } from "@/lib/finance/dashboard-stats";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const typeConfig = {
  income: {
    label: "Receita",
    icon: ArrowUpRight,
    badgeClass: "border-primary/25 bg-primary/5 text-primary",
    valueClass: "text-primary",
  },
  expense: {
    label: "Despesa",
    icon: ArrowDownLeft,
    badgeClass: "border-destructive/25 bg-destructive/5 text-destructive",
    valueClass: "text-destructive",
  },
  transfer: {
    label: "Transferência",
    icon: ArrowRightLeft,
    badgeClass: "border-border bg-muted/60 text-foreground",
    valueClass: "text-muted-foreground",
  },
} as const;

type RecentTransactionsProps = {
  loading: boolean;
  transactions: RecentTransactionItem[];
  monthKey: string;
};

export function RecentTransactions({
  loading,
  transactions,
  monthKey,
}: RecentTransactionsProps) {
  return (
    <DashboardPanel delayMs={200}>
      <DashboardPanelHeader
        title="Lançamentos recentes"
        subtitle="Últimas movimentações registradas"
        action={
          <Link
            href={`/lancamentos?month=${monthKey}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Ver todos
          </Link>
        }
      />

      <CardContent className="divide-y divide-border/50 pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando lançamentos...
          </div>
        ) : transactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
            <p className="text-sm font-medium">Nenhum lançamento ainda</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Quando você registrar receitas ou despesas, elas aparecem aqui.
            </p>
            <Link
              href={`/lancamentos?month=${monthKey}&new=1`}
              className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
            >
              Criar lançamento
            </Link>
          </div>
        ) : (
          transactions.map((transaction) => {
            const config = typeConfig[transaction.type];
            const Icon = config.icon;

            return (
              <div
                key={transaction.id}
                data-testid="recent-transaction-item"
                className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-xl",
                      transaction.type === "income"
                        ? "bg-primary/10 text-primary"
                        : transaction.type === "expense"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>

                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-medium">
                      {transaction.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatDate(transaction.date)}</span>
                      {transaction.accountName ? (
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <span aria-hidden>·</span>
                          <AccountIdentityMark
                            account={{
                              name: transaction.accountName,
                              type: transaction.accountType,
                              color: transaction.accountColor,
                            }}
                            size="xs"
                          />
                          <span className="truncate">
                            {transaction.accountName}
                          </span>
                        </span>
                      ) : null}
                      {transaction.categoryName ? (
                        <span>· {transaction.categoryName}</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <p
                    className={cn(
                      "font-semibold tabular-nums",
                      config.valueClass,
                    )}
                  >
                    {formatCurrency(transaction.amount)}
                  </p>
                  <Badge variant="outline" className={config.badgeClass}>
                    {config.label}
                  </Badge>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </DashboardPanel>
  );
}
