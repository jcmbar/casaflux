"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Loader2, LogOut, Shield } from "lucide-react";

import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { ProfileAppRole } from "@/types/profile";

type AdminShellProps = {
  children: ReactNode;
  actorEmail: string | null | undefined;
  actorName: string | null | undefined;
  actorRole: ProfileAppRole;
};

export function AdminShell({
  children,
  actorEmail,
  actorName,
  actorRole,
}: AdminShellProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createClient();
      if (!supabase) return;
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error(error);
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark
              href="/admin/usuarios"
              surface="header"
              size="sm"
              orientation="horizontal"
              showTagline={false}
            />
            <span className="hidden items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
              <Shield className="size-3.5" />
              Backoffice
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden text-right text-xs sm:block">
              <p className="truncate font-medium text-foreground">
                {actorName || actorEmail || "Admin"}
              </p>
              <p className="text-muted-foreground capitalize">{actorRole}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              render={<Link href="/dashboard" />}
            >
              App
            </Button>
            <ThemeToggle />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <LogOut className="size-3.5" />
              )}
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl p-4 md:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
