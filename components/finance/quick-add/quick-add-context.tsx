"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const QuickAddContext = createContext<{
  open: boolean;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
} | null>(null);

export function useQuickAdd() {
  const context = useContext(QuickAddContext);

  if (!context) {
    throw new Error("useQuickAdd must be used within QuickAddProvider");
  }

  return context;
}

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const openQuickAdd = useCallback(() => setOpen(true), []);
  const closeQuickAdd = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({
      open,
      openQuickAdd,
      closeQuickAdd,
    }),
    [open, openQuickAdd, closeQuickAdd],
  );

  return (
    <QuickAddContext.Provider value={value}>{children}</QuickAddContext.Provider>
  );
}
