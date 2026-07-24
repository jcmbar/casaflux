"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, LogOut, ShieldOff } from "lucide-react";

import { AuthAtmosphere } from "@/components/auth/auth-atmosphere";
import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export default function ContaBloqueadaPage() {
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
    <ThemeProvider>
      <AuthAtmosphere>
        <div className="relative z-10 flex min-h-svh flex-col items-center justify-center px-4 py-10">
          <div className="w-full max-w-md space-y-6 rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
            <BrandMark
              href="/login"
              surface="header"
              size="sm"
              orientation="horizontal"
              showTagline={false}
            />
            <div className="space-y-2">
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <ShieldOff className="size-5" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight">
                Conta indisponível
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Sua conta está inativa ou foi excluída logicamente. Entre em
                contato com o suporte se acredita que isso é um engano.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              Sair
            </Button>
          </div>
        </div>
      </AuthAtmosphere>
    </ThemeProvider>
  );
}
