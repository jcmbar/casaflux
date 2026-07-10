"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useQuickAdd } from "./quick-add-context";
import { QuickAddSheet } from "./quick-add-sheet";

type QuickAddFabProps = {
  disabled?: boolean;
};

export function QuickAddFab({ disabled = false }: QuickAddFabProps) {
  const { open, openQuickAdd } = useQuickAdd();

  return (
    <>
      <Button
        type="button"
        size="icon-lg"
        className={cn(
          "fixed right-4 z-50 size-14 rounded-full shadow-lg",
          "bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+0.75rem)]",
          "lg:bottom-6 lg:right-6",
          open && "pointer-events-none opacity-0",
        )}
        onClick={openQuickAdd}
        disabled={disabled}
        aria-label="Lançamento rápido"
        data-testid="quick-add-fab"
      >
        <Plus className="size-6" />
      </Button>

      <QuickAddSheet />
    </>
  );
}
