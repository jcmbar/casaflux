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
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type MemberParticipationRowProps = {
  loading: boolean;
  participation: MemberParticipationStat[];
  monthLabel: string;
  hasActiveFamily: boolean;
  totalExpense: number;
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
}: {
  member: MemberParticipationStat;
  config: ChartConfig;
  featured?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[132px] flex-col gap-3 rounded-2xl border border-border/50 bg-muted/15 p-4 ring-1 ring-inset ring-white/5",
        featured && "border-primary/25 bg-primary/5",
      )}
    >
      <div className="flex items-start gap-3">
        <ChartContainer
          config={config}
          className="aspect-square h-[72px] w-[72px] shrink-0"
        >
          <RadialBarChart
            data={[
              {
                name: member.name,
                value: member.percentage,
                fill: member.fill,
              },
            ]}
            innerRadius="66%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
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
                    className="fill-foreground text-sm font-semibold"
                  >
                    {member.percentage}%
                  </text>
                );
              }}
            />
          </RadialBarChart>
        </ChartContainer>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-primary-foreground"
              style={{ backgroundColor: member.fill }}
            >
              {getInitials(member.name)}
            </span>
            <p className="truncate font-medium">{member.name}</p>
          </div>
          <p className="text-lg font-semibold tabular-nums tracking-tight">
            {formatCurrency(member.expense)}
          </p>
          <p className="text-xs font-medium text-foreground/70">
            {member.percentage}% das despesas do mês
          </p>
        </div>
      </div>

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
  );
}

export function MemberParticipationRow({
  loading,
  participation,
  monthLabel,
  hasActiveFamily,
  totalExpense,
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
                value={formatCurrency(totalExpense)}
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

      <CardContent className="pt-0">
        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : !hasActiveFamily ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
            Selecione uma família para ver a participação por membro.
          </div>
        ) : participation.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
            Nenhuma despesa por membro neste mês.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {participation.map((member, index) => (
              <ParticipationCard
                key={member.userId}
                member={member}
                config={participationConfig}
                featured={index === 0}
              />
            ))}
          </div>
        )}
      </CardContent>
    </DashboardPanel>
  );
}
