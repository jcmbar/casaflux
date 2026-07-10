"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function capitalizeLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function createMonthDate(year: number, month: number) {
  return new Date(year, month - 1, 1);
}

type MonthSelectorProps = {
  className?: string;
};

export function MonthSelector({ className }: MonthSelectorProps) {
  const now = new Date();
  const [date, setDate] = useState(() =>
    createMonthDate(now.getFullYear(), now.getMonth() + 1),
  );

  const label = capitalizeLabel(
    formatDate(date, "pt-BR", { month: "long", year: "numeric" }),
  );

  function goToPreviousMonth() {
    setDate((current) =>
      createMonthDate(current.getFullYear(), current.getMonth()),
    );
  }

  function goToNextMonth() {
    setDate((current) =>
      createMonthDate(current.getFullYear(), current.getMonth() + 2),
    );
  }

  return (
    <div
      className={cn(
        "flex items-center rounded-xl border border-border/60 bg-background/80 p-1 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={goToPreviousMonth}
        aria-label="Mês anterior"
      >
        <ChevronLeftIcon />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="min-w-28 px-3 font-medium capitalize sm:min-w-36"
            />
          }
        >
          {label}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="max-h-72 w-44 overflow-y-auto">
          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
            const optionDate = createMonthDate(date.getFullYear(), month);
            const optionLabel = capitalizeLabel(
              formatDate(optionDate, "pt-BR", { month: "long" }),
            );
            const isSelected = date.getMonth() + 1 === month;

            return (
              <DropdownMenuItem
                key={month}
                onClick={() => setDate(optionDate)}
                className={cn(isSelected && "bg-accent font-medium")}
              >
                {optionLabel}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={goToNextMonth}
        aria-label="Próximo mês"
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
