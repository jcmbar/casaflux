"use client";

import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { AuthAtmosphere } from "@/components/auth/auth-atmosphere";
import { BrandMark } from "@/components/brand/brand-mark";
import { useAppContext } from "@/contexts/app-context";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ThemeProvider } from "./theme-provider";
import { Button } from "@/components/ui/button";

type FocusedShellProps = {
  children: ReactNode;
};

export function FocusedShell({ children }: FocusedShellProps) {
  const router = useRouter();
  const { signOut } = useAppContext();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    setSigningOut(true);

    try {
      await signOut();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error(error);
      setSigningOut(false);
    }
  }

  return (
    <ThemeProvider>
      <AuthAtmosphere>
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/40 bg-background/80 px-4 backdrop-blur-md md:px-6">
          <BrandMark
            href="/"
            surface="header"
            size="sm"
            orientation="horizontal"
            showTagline={false}
          />

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              Sair
            </Button>
          </div>
        </header>

        <main className="relative flex flex-1 flex-col px-4 py-8 md:px-6 md:py-10">
          {children}
        </main>
      </AuthAtmosphere>
    </ThemeProvider>
  );
}
