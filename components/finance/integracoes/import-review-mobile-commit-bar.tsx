"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useHideWhileEditing() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    function isEditable(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      return Boolean(
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='combobox']",
        ),
      );
    }

    function onFocusIn(event: FocusEvent) {
      if (isEditable(event.target)) {
        setHidden(true);
      }
    }

    function onFocusOut(event: FocusEvent) {
      if (!isEditable(event.target)) {
        return;
      }

      window.setTimeout(() => {
        if (!isEditable(document.activeElement)) {
          setHidden(false);
        }
      }, 0);
    }

    function onViewportChange() {
      const viewport = window.visualViewport;
      if (!viewport) {
        return;
      }

      const keyboardLikelyOpen = window.innerHeight - viewport.height > 120;
      if (keyboardLikelyOpen) {
        setHidden(true);
        return;
      }

      if (!isEditable(document.activeElement)) {
        setHidden(false);
      }
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.visualViewport?.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("scroll", onViewportChange);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("scroll", onViewportChange);
    };
  }, []);

  return hidden;
}

export function ImportReviewMobileCommitBar({
  summary,
  commitLabel,
  disabled,
  committing,
  historyLoading,
  validationError,
  onCommit,
}: {
  summary: string;
  commitLabel: string;
  disabled: boolean;
  committing: boolean;
  historyLoading: boolean;
  validationError?: string | null;
  onCommit: () => void;
}) {
  const hiddenWhileEditing = useHideWhileEditing();

  return (
    <div
      className={cn(
        "fixed z-30 md:hidden",
        // Inset + gap above bottom nav keeps corners free for nav/dev chrome.
        "inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+0.4rem)]",
        "rounded-xl border border-border/50 bg-background/95 px-2.5 py-1.5 shadow-sm backdrop-blur-md supports-backdrop-filter:bg-background/90",
        hiddenWhileEditing && "pointer-events-none invisible",
      )}
      data-testid="import-mobile-commit-bar"
      data-hidden-while-editing={hiddenWhileEditing ? "true" : "false"}
    >
      <div className="mx-auto flex max-w-lg items-center gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {summary}
          </p>
          {historyLoading ? (
            <p
              className="truncate text-[10px] leading-tight text-muted-foreground"
              data-testid="import-mobile-commit-history-loading"
            >
              Verificando histórico…
            </p>
          ) : null}
          {validationError ? (
            <p
              className="line-clamp-1 text-[10px] leading-tight text-amber-800 dark:text-amber-200"
              data-testid="import-mobile-commit-validation-error"
              role="status"
            >
              {validationError}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 px-3"
          disabled={disabled}
          onClick={onCommit}
          data-testid="import-mobile-commit-button"
          title={
            validationError
              ? validationError
              : historyLoading
                ? "Aguardando verificação do histórico"
                : undefined
          }
        >
          {committing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Importando...
            </>
          ) : (
            commitLabel
          )}
        </Button>
      </div>
    </div>
  );
}
