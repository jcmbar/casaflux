"use client";

import { CheckIcon, ChevronsUpDown, Users } from "lucide-react";

import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type FamilySwitcherProps = {
  className?: string;
};

export function FamilySwitcher({ className }: FamilySwitcherProps) {
  const { families, activeFamily, setActiveFamilyId } = useAppContext();

  if (families.length <= 1) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("max-w-[11rem] gap-2 px-2.5", className)}
            aria-label="Família ativa"
          />
        }
      >
        <Users className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{activeFamily?.name ?? "Família"}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Trocar família</DropdownMenuLabel>
        {families.map(({ family }) => {
          const isActive = family.id === activeFamily?.id;

          return (
            <DropdownMenuItem
              key={family.id}
              onClick={() => setActiveFamilyId(family.id)}
            >
              <span className="truncate">{family.name}</span>
              {isActive ? <CheckIcon className="ml-auto size-4 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
