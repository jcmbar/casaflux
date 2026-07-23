"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { StatementStatus } from "@/lib/finance/credit-card-billing";
import {
  getUpcomingStatementDuesEmptyMessage,
  type UpcomingStatementDueItem,
} from "@/lib/finance/upcoming-statement-dues";
import { formatCurrencyOrHidden } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_BADGE_CLASS: Record<StatementStatus, string> = {
  open: "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  partial:
    "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  paid: "border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
  overdue: "border-rose-500/25 bg-rose-500/10 text-rose-900 dark:text-rose-100",
};

export function UpcomingStatementDues({
  items,
  loading = false,
  title = "Próximos vencimentos",
  description = "Faturas de cartão com saldo a pagar, da mais próxima para a mais distante.",
  showSeeAll = true,
  className,
  hideAmounts = false,
}: {
  items: UpcomingStatementDueItem[];
  loading?: boolean;
  title?: string;
  description?: string;
  showSeeAll?: boolean;
  className?: string;
  hideAmounts?: boolean;
}) {
  const money = (value: number) => formatCurrencyOrHidden(value, hideAmounts);
  return (
    <Card
      className={cn("border-border/50 shadow-sm", className)}
      data-testid="upcoming-statement-dues"
    >
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="font-semibold">{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {showSeeAll ? (
          <Link
            href="/faturas"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            data-testid="upcoming-dues-see-all"
          >
            Ver faturas
          </Link>
        ) : null}
      </CardHeader>

      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando vencimentos…</p>
        ) : items.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="upcoming-dues-empty"
          >
            {getUpcomingStatementDuesEmptyMessage()}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((item) => (
              <li key={`${item.cardAccountId}-${item.cycleId}`}>
                <Link
                  href={item.href}
                  className="flex flex-col gap-2 py-3.5 transition-colors hover:bg-muted/40 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`upcoming-due-${item.cardAccountId}-${item.cycleId}`}
                  data-status={item.status}
                  data-needs-attention={item.needsAttention ? "true" : "false"}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{item.cardAccountName}</p>
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
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.periodLabel} · vence {item.dueDateLabel}
                    </p>
                  </div>

                  <dl className="grid grid-cols-3 gap-3 text-xs sm:min-w-[240px]">
                    <div>
                      <dt className="text-muted-foreground">A pagar</dt>
                      <dd className="font-medium tabular-nums">
                        {money(item.amountDueTotal)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Pago</dt>
                      <dd className="font-medium tabular-nums">
                        {money(item.paidTotal)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Restante</dt>
                      <dd
                        className={cn(
                          "font-semibold tabular-nums",
                          item.remainingTotal > 0
                            ? "text-destructive"
                            : "text-primary",
                        )}
                      >
                        {money(item.remainingTotal)}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** @deprecated Prefer UpcomingStatementDues — kept as alias for older imports. */
export const UpcomingBills = UpcomingStatementDues;
