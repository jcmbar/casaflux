import type { ComponentProps } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardPanelProps = ComponentProps<typeof Card> & {
  delayMs?: number;
};

export function DashboardPanel({
  className,
  delayMs = 0,
  style,
  ...props
}: DashboardPanelProps) {
  return (
    <Card
      className={cn(
        "dashboard-panel animate-chart-in border-border/50",
        className,
      )}
      style={{
        ...style,
        animationDelay: delayMs ? `${delayMs}ms` : undefined,
      }}
      {...props}
    />
  );
}
