import type { Goal } from "@/types/goal";

export const mockGoals: Goal[] = [
  {
    id: "goal-1",
    name: "Reserva de emergência",
    targetAmount: 20000,
    currentAmount: 12000,
    status: "active",
    progressMode: "manual",
    accountId: null,
    linkedAccount: null,
  },
  {
    id: "goal-2",
    name: "Viagem em família",
    targetAmount: 8000,
    currentAmount: 3200,
    deadline: "2026-12-31",
    status: "active",
    progressMode: "manual",
    accountId: null,
    linkedAccount: null,
  },
];
