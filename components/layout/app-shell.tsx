"use client";

import { QuickAddRoot } from "@/components/finance/quick-add/quick-add-root";
import { ConfirmDialogProvider } from "@/components/feedback/confirm-dialog-provider";
import { Toaster } from "@/components/ui/sonner";

import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { BottomNav } from "./bottom-nav";
import { ThemeProvider } from "./theme-provider";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <ThemeProvider>
      <ConfirmDialogProvider>
        <QuickAddRoot>
        <div className="flex min-h-svh bg-background">
          <AppSidebar />

          <div className="flex min-w-0 flex-1 flex-col">
            <AppHeader />

            {/* Bottom padding reserves scroll clearance for the bottom nav and
                the quick-add FAB, so trailing list items (and their action
                menus) can always scroll above the floating button. */}
            <main className="relative flex-1 overflow-auto pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] lg:pb-24">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--tw-gradient-stops))] from-primary/[0.06] via-transparent to-transparent dark:from-primary/[0.08]"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,var(--tw-gradient-stops))] from-primary/[0.03] via-transparent to-transparent dark:from-primary/[0.05]"
              />

              <div className="relative mx-auto w-full max-w-7xl p-4 md:p-6 lg:p-8">
                {children}
              </div>
            </main>

            <BottomNav />
          </div>
        </div>
        </QuickAddRoot>

        <Toaster richColors closeButton position="top-right" />
      </ConfirmDialogProvider>
    </ThemeProvider>
  );
}
