import { FocusedShell } from "@/components/layout/focused-shell";
import { AppProvider } from "@/contexts/app-context";

export default function FocusedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppProvider>
      <FocusedShell>{children}</FocusedShell>
    </AppProvider>
  );
}
