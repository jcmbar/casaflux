import type { SupabaseClient } from "@supabase/supabase-js";

/** Matches Supabase API `max_rows` default — a single request silently truncates past this. */
export const TRANSACTIONS_PAGE_SIZE = 1000;

export type FetchTransactionsResult<T> = {
  data: T[];
  error: { message: string } | null;
  /** True when more than one page was required (data would have been truncated without pagination). */
  paginated: boolean;
};

/**
 * Loads every matching transaction by paging with `.range()`.
 * Without this, PostgREST returns at most `max_rows` (1000) and older
 * statement-cycle purchases (e.g. late June) silently disappear from totals.
 */
export async function fetchAllTransactionsForAccounts<T>(
  supabase: SupabaseClient,
  input: {
    accountIds: string[];
    select: string;
    pageSize?: number;
    /** Inclusive lower bound on transaction_date (YYYY-MM-DD). */
    dateFrom?: string;
    /** Inclusive upper bound on transaction_date (YYYY-MM-DD). */
    dateTo?: string;
  },
): Promise<FetchTransactionsResult<T>> {
  if (input.accountIds.length === 0) {
    return { data: [], error: null, paginated: false };
  }

  const pageSize = input.pageSize ?? TRANSACTIONS_PAGE_SIZE;
  const all: T[] = [];
  let from = 0;
  let pageCount = 0;

  while (true) {
    const to = from + pageSize - 1;
    let query = supabase
      .from("transactions")
      .select(input.select)
      .in("account_id", input.accountIds)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.dateFrom) {
      query = query.gte("transaction_date", input.dateFrom);
    }
    if (input.dateTo) {
      query = query.lte("transaction_date", input.dateTo);
    }

    const { data, error } = await query;
    pageCount += 1;

    if (error) {
      return {
        data: all,
        error: { message: error.message },
        paginated: pageCount > 1,
      };
    }

    const rows = (data ?? []) as T[];
    all.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;

    // Hard stop against runaway loops on misconfigured page sizes.
    if (from > 200_000) {
      break;
    }
  }

  return {
    data: all,
    error: null,
    paginated: pageCount > 1,
  };
}
