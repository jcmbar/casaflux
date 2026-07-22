"use client";

import { ChevronDown, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ImportReviewMobileSectionId =
  | "context"
  | "payment"
  | "categories"
  | "other";

export function ImportReviewMobileSection({
  id,
  title,
  summary,
  open,
  onOpenChange,
  children,
  className,
  contentClassName,
  desktopHeader,
  attention = false,
  "data-testid": dataTestId,
}: {
  id: ImportReviewMobileSectionId;
  title: string;
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Cabeçalho visível só no desktop (cards já trazem título próprio). */
  desktopHeader?: ReactNode;
  /** Soft attention styling for the mobile accordion header. */
  attention?: boolean;
  "data-testid"?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm",
        attention && "border-amber-500/30",
        className,
      )}
      data-testid={dataTestId ?? `import-mobile-section-${id}`}
      data-open={open ? "true" : "false"}
      data-attention={attention ? "true" : "false"}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left md:hidden"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        data-testid={`import-mobile-section-toggle-${id}`}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            {attention ? (
              <AlertTriangle
                className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
            ) : null}
            {title}
          </p>
          {summary ? (
            <p
              className={cn(
                "truncate text-xs",
                attention
                  ? "text-amber-900/80 dark:text-amber-100/80"
                  : "text-muted-foreground",
              )}
            >
              {summary}
            </p>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {desktopHeader ? (
        <div className="hidden md:block">{desktopHeader}</div>
      ) : null}

      <div
        className={cn(
          contentClassName,
          open ? "block" : "hidden",
          "md:block",
        )}
        data-testid={`import-mobile-section-body-${id}`}
      >
        {children}
      </div>
    </section>
  );
}
