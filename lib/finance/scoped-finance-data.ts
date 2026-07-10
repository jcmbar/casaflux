import type { SupabaseClient } from "@supabase/supabase-js";

import type { Account } from "@/types/account";

import {
  filterAccountsByFinanceScope,
  getScopedAccountIds,
  type FinanceViewScope,
} from "./finance-scope";

type FetchScopedFinanceDataResult<TRow> = {
  accounts: Account[];
  transactionRows: TRow[];
  accountsError: Error | null;
  transactionsError: Error | null;
};

export async function fetchScopedFinanceData<TRow extends { account_id: string }>(
  supabase: SupabaseClient,
  scope: FinanceViewScope,
  transactionsSelect: string,
): Promise<FetchScopedFinanceDataResult<TRow>> {
  const accountsRes = await supabase.from("accounts").select("*").order("name");

  if (accountsRes.error) {
    return {
      accounts: [],
      transactionRows: [],
      accountsError: accountsRes.error,
      transactionsError: null,
    };
  }

  const allAccounts = (accountsRes.data ?? []) as Account[];
  const scopedAccounts = filterAccountsByFinanceScope(allAccounts, scope);
  const scopedAccountIds = getScopedAccountIds(allAccounts, scope);

  if (scopedAccountIds.length === 0) {
    return {
      accounts: scopedAccounts,
      transactionRows: [],
      accountsError: null,
      transactionsError: null,
    };
  }

  const transactionsRes = await supabase
    .from("transactions")
    .select(transactionsSelect)
    .in("account_id", scopedAccountIds)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  return {
    accounts: scopedAccounts,
    transactionRows: (transactionsRes.data ?? []) as unknown as TRow[],
    accountsError: null,
    transactionsError: transactionsRes.error,
  };
}
