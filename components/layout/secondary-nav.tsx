"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { secondaryNavItems } from "./nav-items";

type SecondaryNavProps = {
  onNavigate?: () => void;
};

export function SecondaryNav({ onNavigate }: SecondaryNavProps) {
  const pathname = usePathname();

  if (secondaryNavItems.length === 0) {
    return null;
  }

  return (
    <nav className="flex flex-col gap-1" aria-label="Mais opções">
      <p className="px-3 pb-1 text-xs font-medium tracking-wider text-sidebar-foreground/50 uppercase">
        Mais
      </p>
      {secondaryNavItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              isActive
                ? "bg-primary/10 text-primary ring-1 ring-primary/15"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                isActive ? "text-primary" : "text-sidebar-foreground/60",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
