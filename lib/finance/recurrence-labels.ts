import type { RecurrenceEndType, RecurrenceFrequency } from "@/types/recurrence";

/** Product-facing frequency labels for prediction/recurrence forms. */
export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: "Toda semana",
  biweekly: "A cada 2 semanas",
  monthly: "Todo mês",
  yearly: "Todo ano",
};

/** Product-facing end-rule labels. */
export const RECURRENCE_END_TYPE_LABELS: Record<RecurrenceEndType, string> = {
  never: "Sem data final",
  until_date: "Em uma data",
  occurrences_count: "Após uma quantidade",
};

export const RECURRENCE_FREQUENCY_OPTIONS: RecurrenceFrequency[] = [
  "weekly",
  "biweekly",
  "monthly",
  "yearly",
];

export const RECURRENCE_END_TYPE_OPTIONS: RecurrenceEndType[] = [
  "never",
  "until_date",
  "occurrences_count",
];
