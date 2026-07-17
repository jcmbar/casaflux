import type { SupabaseClient } from "@supabase/supabase-js";

import { filterRealAccounts, type Account } from "@/types/account";

import {
  filterAccountsByFinanceScope,
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
  options: { includeForecastAccounts?: boolean } = {},
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
  const includedAccounts = options.includeForecastAccounts
    ? scopedAccounts
    : filterRealAccounts(scopedAccounts);
  const scopedAccountIds = includedAccounts.map((account) => account.id);

  if (scopedAccountIds.length === 0) {
    return {
      accounts: includedAccounts,
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
    accounts: includedAccounts,
    transactionRows: (transactionsRes.data ?? []) as unknown as TRow[],
    accountsError: null,
    transactionsError: transactionsRes.error,
  };
}
