import { BrandMark } from "@/components/brand/brand-mark";
import { Separator } from "@/components/ui/separator";

import { SidebarSignOutButton } from "./sidebar-sign-out-button";
import { SidebarNav } from "./sidebar-nav";

export function AppSidebar() {
  return (
    <aside className="hidden h-svh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center px-5">
        <BrandMark
          href="/dashboard"
          surface="sidebar_expanded"
          size="sm"
          orientation="horizontal"
          showTagline={false}
        />
      </div>

      <Separator className="bg-sidebar-border" />

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav />
      </div>

      <div className="space-y-3 border-t border-sidebar-border p-4">
        <SidebarSignOutButton />

        <div className="rounded-xl border border-sidebar-border/60 bg-gradient-to-br from-primary/[0.06] to-transparent p-3">
          <p className="text-xs font-medium text-sidebar-foreground">
            Plano familiar
          </p>
          <p className="mt-1 text-xs leading-relaxed text-sidebar-foreground/60">
            Contas pessoais e compartilhadas
          </p>
        </div>
      </div>
    </aside>
  );
}
