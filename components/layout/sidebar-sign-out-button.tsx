"use client";

import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAppContext } from "@/contexts/app-context";
import { cn } from "@/lib/utils";

type SidebarSignOutButtonProps = {
  className?: string;
  onSignedOut?: () => void;
};

export function SidebarSignOutButton({
  className,
  onSignedOut,
}: SidebarSignOutButtonProps) {
  const router = useRouter();
  const { signOut } = useAppContext();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      await signOut();
      onSignedOut?.();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
        "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" />
      ) : (
        <LogOut className="size-4 shrink-0" />
      )}
      Sair
    </button>
  );
}
