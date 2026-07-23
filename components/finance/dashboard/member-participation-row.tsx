"use client";

import { Loader2 } from "lucide-react";
import { Label, RadialBar, RadialBarChart } from "recharts";

import {
  DashboardPanelHeader,
  DashboardStatPill,
} from "@/components/finance/dashboard/dashboard-panel-header";
import { DashboardPanel } from "@/components/finance/dashboard/dashboard-panel";
import { CardContent } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import type { MemberParticipationStat } from "@/lib/finance/dashboard-stats";
import { formatCurrencyOrHidden } from "@/lib/format";
import { cn } from "@/lib/utils";

type MemberParticipationRowProps = {
  loading: boolean;
  participation: MemberParticipationStat[];
  monthLabel: string;
  hasActiveFamily: boolean;
  totalExpense: number;
  hideAmounts?: boolean;
};

function buildParticipationConfig(
  participation: MemberParticipationStat[],
): ChartConfig {
  return participation.reduce<ChartConfig>((config, member) => {
    config[member.userId] = {
      label: member.name,
      color: member.fill,
    };
    return config;
  }, {});
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ParticipationCard({
  member,
  config,
  featured = false,
  hideAmounts = false,
}: {
  member: MemberParticipationStat;
  config: ChartConfig;
  featured?: boolean;
  hideAmounts?: boolean;
}) {
  return (
    <div
      className={cn(
        "@container/member-card flex min-h-[168px] flex-col gap-3 rounded-2xl border border-border/50 bg-muted/15 py-4 pr-4 pl-3 ring-1 ring-inset ring-white/5",
        featured && "border-primary/25 bg-primary/5",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <ChartContainer
          config={config}
          className="-ml-0.5 aspect-square size-[56px] shrink-0"
        >
          <RadialBarChart
            data={[
              {
                name: member.name,
                value: member.percentage,
                fill: member.fill,
              },
            ]}
            innerRadius="60%"
            outerRadius="82%"
            startAngle={90}
            endAngle={-270}
            margin={{ top: 3, right: 3, bottom: 3, left: 3 }}
          >
            <RadialBar
              dataKey="value"
              cornerRadius={8}
              background={{
                fill: "color-mix(in oklch, var(--muted) 70%, transparent)",
              }}
              isAnimationActive
              animationDuration={850}
              animationEasing="ease-out"
            />
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                  return null;
                }

                return (
                  <text
                    x={viewBox.cx}
                    y={viewBox.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-foreground text-xs font-semibold"
                  >
                    {member.percentage}%
                  </text>
                );
              }}
            />
          </RadialBarChart>
        </ChartContainer>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start gap-2">
            <span
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-primary-foreground"
              style={{ backgroundColor: member.fill }}
            >
              {getInitials(member.name)}
            </span>
            <p
              className="min-w-0 flex-1 font-medium leading-snug break-words line-clamp-1 @[200px]/member-card:line-clamp-2"
              title={member.name}
            >
              {member.name}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-lg font-semibold tabular-nums tracking-tight">
              {formatCurrencyOrHidden(member.expense, hideAmounts)}
            </p>
            <p className="text-xs font-medium leading-snug text-foreground/70">
              {member.percentage}% das despesas do mês
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-1">
        <div
          className="h-2 overflow-hidden rounded-full bg-muted/80 ring-1 ring-inset ring-white/5"
          aria-hidden
        >
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${member.percentage}%`,
              backgroundColor: member.fill,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function MemberParticipationRow({
  loading,
  participation,
  monthLabel,
  hasActiveFamily,
  totalExpense,
  hideAmounts = false,
}: MemberParticipationRowProps) {
  const participationConfig = buildParticipationConfig(participation);
  const topMember = participation[0];

  return (
    <DashboardPanel delayMs={200} className="h-full">
      <DashboardPanelHeader
        title="Participação por membro"
        subtitle={monthLabel}
        stats={
          !loading && participation.length > 0 ? (
            <>
              <DashboardStatPill
                label="Total"
                value={formatCurrencyOrHidden(totalExpense, hideAmounts)}
                tone="expense"
              />
              <DashboardStatPill
                label="Membros"
                value={String(participation.length)}
              />
              {topMember ? (
                <DashboardStatPill
                  label="Maior parte"
                  value={topMember.name.split(" ")[0] ?? topMember.name}
                  tone="accent"
                />
              ) : null}
            </>
          ) : null
        }
      />

      <CardContent className="pt-0 pb-1">
        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : !hasActiveFamily ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
            Selecione uma família para ver a participação por membro.
          </div>
        ) : participation.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
            Nenhuma despesa por membro neste mês.
          </div>
        ) : (
          <div className="grid items-stretch gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr))]">
            {participation.map((member, index) => (
              <ParticipationCard
                key={member.userId}
                member={member}
                config={participationConfig}
                featured={index === 0}
                hideAmounts={hideAmounts}
              />
            ))}
          </div>
        )}
      </CardContent>
    </DashboardPanel>
  );
}
