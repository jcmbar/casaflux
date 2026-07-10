"use client";

import { MenuIcon } from "lucide-react";
import { useState } from "react";

import { BrandMark } from "@/components/auth/brand-mark";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { SecondaryNav } from "./secondary-nav";
import { SidebarSignOutButton } from "./sidebar-sign-out-button";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="size-9 shrink-0 lg:hidden"
            aria-label="Abrir mais opções"
          />
        }
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 border-sidebar-border bg-sidebar p-0"
      >
        <SheetHeader className="border-b border-sidebar-border px-5 py-4 text-left">
          <SheetTitle className="sr-only">Menu CasaFlux</SheetTitle>
          <BrandMark href="/dashboard" size="sm" orientation="horizontal" />
        </SheetHeader>

        <div className="px-3 py-4">
          <SecondaryNav onNavigate={() => setOpen(false)} />
        </div>

        <Separator className="bg-sidebar-border" />

        <div className="px-3 py-2">
          <SidebarSignOutButton onSignedOut={() => setOpen(false)} />
        </div>

        <div className="p-4">
          <div className="rounded-xl border border-sidebar-border/60 bg-gradient-to-br from-primary/[0.06] to-transparent p-3">
            <p className="text-xs font-medium text-sidebar-foreground">
              Plano familiar
            </p>
            <p className="mt-1 text-xs leading-relaxed text-sidebar-foreground/60">
              Contas pessoais e compartilhadas
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
