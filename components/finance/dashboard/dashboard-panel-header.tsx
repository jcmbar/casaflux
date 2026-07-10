import type { ReactNode } from "react";

import { CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardPanelHeaderProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  stats?: ReactNode;
  className?: string;
};

export function DashboardPanelHeader({
  title,
  subtitle,
  action,
  stats,
  className,
}: DashboardPanelHeaderProps) {
  return (
    <CardHeader className={cn("gap-3 pb-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="dashboard-panel-title">{title}</CardTitle>
          {subtitle ? (
            <p className="dashboard-panel-subtitle capitalize">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {stats ? <div className="flex flex-wrap gap-2">{stats}</div> : null}
    </CardHeader>
  );
}

type DashboardStatPillProps = {
  label: string;
  value: string;
  tone?: "default" | "income" | "expense" | "accent";
};

const toneStyles = {
  default:
    "border-border/60 bg-muted/35 text-foreground [&_span]:text-muted-foreground",
  income:
    "border-chart-1/25 bg-chart-1/10 text-foreground [&_span]:text-chart-1",
  expense:
    "border-chart-2/25 bg-chart-2/10 text-foreground [&_span]:text-chart-2",
  accent:
    "border-primary/25 bg-primary/10 text-foreground [&_span]:text-primary",
} as const;

export function DashboardStatPill({
  label,
  value,
  tone = "default",
}: DashboardStatPillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ring-1 ring-inset ring-white/5",
        toneStyles[tone],
      )}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
