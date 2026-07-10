import { AppShell } from "@/components/layout/app-shell";
import { AppProvider } from "@/contexts/app-context";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
