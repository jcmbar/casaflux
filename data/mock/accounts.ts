import type { Account } from "@/types/account";

const mockDefaults = {
  owner_user_id: "mock-user",
  family_id: null,
  is_family_shared: false,
  allow_family_view: false,
  allow_family_post: false,
  allow_family_edit: false,
  account_mode: "real",
  created_at: "2025-01-01T00:00:00.000Z",
} as const;

export const mockAccounts: Account[] = [
  {
    id: "acc-1",
    name: "Conta corrente",
    type: "checking",
    balance: 4250.75,
    color: "#2563eb",
    statement_closing_day: null,
    statement_due_day: null,
    ...mockDefaults,
  },
  {
    id: "acc-2",
    name: "Poupança",
    type: "savings",
    balance: 12000,
    color: "#16a34a",
    statement_closing_day: null,
    statement_due_day: null,
    ...mockDefaults,
  },
  {
    id: "acc-3",
    name: "Cartão de crédito",
    type: "credit_card",
    balance: -850.3,
    color: "#dc2626",
    statement_closing_day: 20,
    statement_due_day: 27,
    ...mockDefaults,
  },
];
