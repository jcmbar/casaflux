"use client";

import { Loader2 } from "lucide-react";

import { DashboardPanelHeader } from "@/components/finance/dashboard/dashboard-panel-header";
import { DashboardPanel } from "@/components/finance/dashboard/dashboard-panel";
import { CardContent } from "@/components/ui/card";
import type { MemberMonthStat } from "@/lib/finance/dashboard-stats";
import { formatCurrencyOrHidden } from "@/lib/format";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

type FamilyOverviewProps = {
  loading: boolean;
  members: MemberMonthStat[];
  monthLabel: string;
  hasActiveFamily: boolean;
  hideAmounts?: boolean;
};

export function FamilyOverview({
  loading,
  members,
  monthLabel,
  hasActiveFamily,
  hideAmounts = false,
}: FamilyOverviewProps) {
  return (
    <DashboardPanel delayMs={280} className="h-full">
      <DashboardPanelHeader
        title="Visão por membro"
        subtitle={monthLabel}
      />

      <CardContent className="divide-y divide-border/50 pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando membros...
          </div>
        ) : !hasActiveFamily ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
            <p className="text-sm font-medium">Nenhuma família ativa</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Selecione ou crie uma família para ver a divisão por membro.
            </p>
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
            <p className="text-sm font-medium">Nenhum membro encontrado</p>
          </div>
        ) : (
          members.map((member) => (
            <div
              key={member.userId}
              className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary ring-1 ring-inset ring-primary/15">
                  {getInitials(member.name)}
                </span>
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-muted-foreground">{member.role}</p>
                </div>
              </div>

              <div className="text-sm sm:text-right">
                <p className="text-primary tabular-nums">
                  Entrada:{" "}
                  {formatCurrencyOrHidden(member.income, hideAmounts)}
                </p>
                <p className="text-muted-foreground tabular-nums">
                  Saída:{" "}
                  {formatCurrencyOrHidden(member.expense, hideAmounts)}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </DashboardPanel>
  );
}
