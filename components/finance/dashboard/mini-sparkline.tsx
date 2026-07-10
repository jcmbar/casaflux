"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import type { SparklinePoint } from "@/lib/finance/dashboard-stats";
import { cn } from "@/lib/utils";

type MiniSparklineProps = {
  data: SparklinePoint[];
  variant?: "primary" | "income" | "expense" | "neutral" | "inverted";
  className?: string;
  compact?: boolean;
};

const strokeMap = {
  primary: "var(--chart-1)",
  income: "var(--chart-1)",
  expense: "var(--chart-2)",
  neutral: "var(--chart-3)",
  inverted: "color-mix(in oklch, white 90%, var(--chart-1) 10%)",
} as const;

const glowClassMap = {
  primary: "dashboard-chart-glow-income",
  income: "dashboard-chart-glow-income",
  expense: "dashboard-chart-glow-expense",
  neutral: "",
  inverted: "dashboard-chart-glow-income",
} as const;

export function MiniSparkline({
  data,
  variant = "primary",
  className,
  compact = false,
}: MiniSparklineProps) {
  const gradientId = useId().replace(/:/g, "");
  const stroke = strokeMap[variant];

  if (data.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative min-w-0 flex-1",
        compact ? "h-14 max-w-[140px]" : "h-16 w-full",
        glowClassMap[variant],
        className,
      )}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 6, right: 2, left: 2, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.55} />
              <stop offset="65%" stopColor={stroke} stopOpacity={0.12} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="natural"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
