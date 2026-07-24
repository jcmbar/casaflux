import Link from "next/link";

import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchAdminUserStats,
  fetchAdminUsers,
  requirePlatformAdmin,
} from "@/lib/admin/users";
import type { ProfileStatus } from "@/types/profile";

type SearchParams = Promise<{
  q?: string;
  status?: string;
}>;

const STATUS_FILTERS: Array<{
  value: "all" | ProfileStatus;
  label: string;
}> = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "deleted", label: "Excluídos" },
];

function parseStatus(value: string | undefined): "all" | ProfileStatus {
  if (
    value === "active" ||
    value === "inactive" ||
    value === "deleted"
  ) {
    return value;
  }
  return "all";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const actor = await requirePlatformAdmin();
  const params = await searchParams;
  const search = params.q?.trim() ?? "";
  const status = parseStatus(params.status);

  const [stats, users] = await Promise.all([
    fetchAdminUserStats(),
    fetchAdminUsers({ search, status }),
  ]);

  const summaryCards = [
    { label: "Total", value: stats.total_users },
    { label: "Ativos", value: stats.active_users },
    { label: "Inativos", value: stats.inactive_users },
    { label: "Excluídos", value: stats.deleted_users },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Gestão operacional de contas. Exclusão definitiva não está disponível
          nesta versão.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border/50 bg-card p-4 shadow-sm"
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {card.value}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-border/50 bg-card p-4 shadow-sm">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="admin-user-search" className="text-sm font-medium">
              Buscar
            </label>
            <Input
              id="admin-user-search"
              name="q"
              defaultValue={search}
              placeholder="Nome ou e-mail"
            />
          </div>
          {status !== "all" ? (
            <input type="hidden" name="status" value={status} />
          ) : null}
          <Button type="submit">Filtrar</Button>
        </form>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => {
            const href =
              filter.value === "all"
                ? search
                  ? `/admin/usuarios?q=${encodeURIComponent(search)}`
                  : "/admin/usuarios"
                : `/admin/usuarios?status=${filter.value}${
                    search ? `&q=${encodeURIComponent(search)}` : ""
                  }`;

            return (
              <Button
                key={filter.value}
                type="button"
                size="sm"
                variant={status === filter.value ? "default" : "outline"}
                render={<Link href={href} />}
              >
                {filter.label}
              </Button>
            );
          })}
        </div>
      </section>

      <AdminUsersTable
        users={users}
        actorUserId={actor.userId}
        actorRole={actor.profile.app_role ?? "admin"}
      />
    </div>
  );
}
