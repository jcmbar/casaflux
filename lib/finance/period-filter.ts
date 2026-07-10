import {
  filterTransactionsByMonth,
  getMonthKey,
  getMonthLabel,
  getNextMonthKey,
  getPreviousMonthKey,
} from "@/lib/finance/dashboard-stats";
import type { Transaction } from "@/types/transaction";

export type PeriodMode = "month" | "all";

export type PeriodFilter = {
  mode: PeriodMode;
  monthKey: string;
};

export function getDefaultPeriodFilter(): PeriodFilter {
  return {
    mode: "month",
    monthKey: getMonthKey(),
  };
}

export function parsePeriodFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): PeriodFilter {
  if (searchParams.get("period") === "all") {
    return { mode: "all", monthKey: getMonthKey() };
  }

  const month = searchParams.get("month");
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    return { mode: "month", monthKey: month };
  }

  return getDefaultPeriodFilter();
}

export function filterTransactionsByPeriod(
  transactions: Transaction[],
  period: PeriodFilter,
) {
  if (period.mode === "all") {
    return transactions;
  }

  return filterTransactionsByMonth(transactions, period.monthKey);
}

export function getPeriodSummaryLabel(period: PeriodFilter) {
  if (period.mode === "all") {
    return "Todo o histórico";
  }

  return getMonthLabel(period.monthKey);
}

export { getMonthKey, getMonthLabel, getNextMonthKey, getPreviousMonthKey };
