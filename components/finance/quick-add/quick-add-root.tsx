"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { useAppContext } from "@/contexts/app-context";
import {
  filterAccountsByFinanceScope,
  getFinanceViewScope,
} from "@/lib/finance/finance-scope";
import { createClient } from "@/lib/supabase/client";
import { canPostToAccount, type Account } from "@/types/account";

import { QuickAddProvider } from "./quick-add-context";
import { QuickAddFab } from "./quick-add-fab";

type QuickAddRootProps = {
  children: React.ReactNode;
};

function QuickAddFabGate() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient()!, []);
  const { user, activeFamily } = useAppContext();
  const [hasPostableAccount, setHasPostableAccount] = useState(false);
  const [checked, setChecked] = useState(false);

  const hideOnImportReview = pathname.startsWith("/importacoes/nova");

  const scope = useMemo(
    () =>
      user
        ? getFinanceViewScope({
            userId: user.id,
            activeFamilyId: activeFamily?.id ?? null,
          })
        : null,
    [activeFamily?.id, user],
  );

  useEffect(() => {
    if (!scope || !user) {
      setHasPostableAccount(false);
      setChecked(true);
      return;
    }

    const activeScope = scope;
    const userId = user.id;
    let cancelled = false;

    async function checkAccounts() {
      const { data, error } = await supabase.from("accounts").select("*");

      if (error) {
        console.error(error);
      }

      if (cancelled) return;

      const scopedAccounts = filterAccountsByFinanceScope(
        (data ?? []) as Account[],
        activeScope,
      );
      const postable = scopedAccounts.some((account) =>
        canPostToAccount(account, userId),
      );

      setHasPostableAccount(postable);
      setChecked(true);
    }

    void checkAccounts();

    return () => {
      cancelled = true;
    };
  }, [scope, supabase, user]);

  if (!user || !checked || hideOnImportReview) return null;

  return <QuickAddFab disabled={!hasPostableAccount} />;
}

export function QuickAddRoot({ children }: QuickAddRootProps) {
  return (
    <QuickAddProvider>
      {children}
      <QuickAddFabGate />
    </QuickAddProvider>
  );
}
