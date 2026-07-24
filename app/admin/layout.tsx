import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { requirePlatformAdmin } from "@/lib/admin/users";

import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const actor = await requirePlatformAdmin();

  return (
    <ThemeProvider>
      <AdminShell
        actorEmail={actor.profile.email}
        actorName={actor.profile.full_name}
        actorRole={actor.profile.app_role ?? "admin"}
      >
        {children}
      </AdminShell>
      <Toaster richColors closeButton position="top-right" />
    </ThemeProvider>
  );
}
