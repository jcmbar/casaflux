"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { FormSelect } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import {
  getNextMonthKey,
  getPeriodSummaryLabel,
  getPreviousMonthKey,
  type PeriodFilter,
  type PeriodMode,
} from "@/lib/finance/period-filter";
import { cn } from "@/lib/utils";

type PeriodFilterBarProps = {
  period: PeriodFilter;
  onChange: (period: PeriodFilter) => void;
  className?: string;
  allowAll?: boolean;
};

export function PeriodFilterBar({
  period,
  onChange,
  className,
  allowAll = true,
}: PeriodFilterBarProps) {
  function handleModeChange(mode: PeriodMode) {
    onChange({ ...period, mode });
  }

  function handleMonthChange(monthKey: string) {
    onChange({ mode: "month", monthKey });
  }

  return (
    <div
      className={cn(
        "animate-enter flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FormSelect
          id="period-mode"
          label="Período"
          value={period.mode}
          onChange={(event) =>
            handleModeChange(event.target.value as PeriodMode)
          }
          className="sm:min-w-44"
        >
          <option value="month">Mês específico</option>
          {allowAll ? <option value="all">Todo o histórico</option> : null}
        </FormSelect>

        {period.mode === "month" ? (
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Mês anterior"
              onClick={() =>
                handleMonthChange(getPreviousMonthKey(period.monthKey))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <label className="grid gap-2 text-sm">
              <span className="font-medium">Mês</span>
              <input
                id="period-month"
                type="month"
                value={period.monthKey}
                onChange={(event) => handleMonthChange(event.target.value)}
                className="h-10 rounded-lg border border-input bg-surface-sunken/60 px-3 text-sm dark:bg-input/40"
              />
            </label>

            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Próximo mês"
              onClick={() =>
                handleMonthChange(getNextMonthKey(period.monthKey))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground capitalize sm:text-right">
        {getPeriodSummaryLabel(period)}
      </p>
    </div>
  );
}
