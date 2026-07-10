"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function UserMenu() {
  const router = useRouter();
  const { profile, activeFamily, signOut } = useAppContext();

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  const displayName =
    profile?.full_name?.trim() ||
    profile?.email?.split("@")[0] ||
    "Usuário";

  const initials = getInitials(displayName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="max-w-[2.75rem] gap-2 px-1.5 sm:max-w-none sm:px-2"
            aria-label={`Conta: ${displayName}`}
          />
        }
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary",
          )}
        >
          {initials}
        </span>
        <span className="hidden truncate sm:inline">{displayName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                {initials}
              </span>
              <div className="min-w-0 space-y-1">
                <p className="truncate font-medium">{displayName}</p>
                {profile?.email ? (
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {profile.email}
                  </p>
                ) : null}
              </div>
            </div>
            {activeFamily ? (
              <p className="mt-2 text-xs font-normal text-muted-foreground">
                Família: {activeFamily.name}
              </p>
            ) : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleSignOut()}>
          <LogOut className="h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
