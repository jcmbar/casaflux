"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { primaryNavItems } from "./nav-items";

export function BottomNav() {
  const pathname = usePathname();
  const activeIndex = primaryNavItems.findIndex(
    (item) =>
      pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-background/90 backdrop-blur-md supports-backdrop-filter:bg-background/75 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="relative mx-auto max-w-lg">
        <div
          aria-hidden
          className="absolute inset-x-4 top-0 h-0.5 transition-all duration-200 ease-out"
          style={{
            width:
              activeIndex >= 0
                ? `calc((100% - 2rem) / ${primaryNavItems.length})`
                : 0,
            transform:
              activeIndex >= 0
                ? `translateX(calc(1rem + ${activeIndex} * ((100% - 2rem) / ${primaryNavItems.length})))`
                : undefined,
          }}
        >
          <div className="h-full rounded-full bg-primary" />
        </div>

        <div className="grid h-14 grid-cols-4">
          {primaryNavItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "size-5 shrink-0 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="max-w-full truncate leading-none">
                  {item.shortLabel ?? item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
