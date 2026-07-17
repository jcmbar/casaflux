"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";

import { FamilySwitcher } from "./family-switcher";
import { MobileNav } from "./mobile-nav";
import { getPageMeta } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function AppHeader() {
  const pathname = usePathname();
  const { families } = useAppContext();
  const { title } = getPageMeta(pathname);
  const showFamilyRow = families.length > 1;

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/70">
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 md:h-16 md:px-6">
        <MobileNav />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <FamilySwitcher className="hidden md:inline-flex" />
          <ThemeToggle />
          <UserMenu />
          <Button
            render={<Link href="/lancamentos?new=1" />}
            className="hidden shadow-sm sm:inline-flex"
          >
            <PlusIcon data-icon="inline-start" />
            Novo lançamento
          </Button>
          <Button
            render={<Link href="/lancamentos?new=1" />}
            size="icon"
            className="sm:hidden"
            aria-label="Novo lançamento"
          >
            <PlusIcon />
          </Button>
        </div>
      </div>

      {showFamilyRow ? (
        <div className="border-t border-border/30 px-4 pb-3 md:hidden">
          <FamilySwitcher className="w-full max-w-none" />
        </div>
      ) : null}
    </header>
  );
}
