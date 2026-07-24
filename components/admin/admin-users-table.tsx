"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";

import {
  inactivateUserAction,
  reactivateUserAction,
  softDeleteUserAction,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdminUserRow } from "@/lib/admin/users";
import { canManageAdminTarget } from "@/lib/admin/permissions";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { ProfileAppRole, ProfileStatus } from "@/types/profile";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<ProfileStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  deleted: "Excluído",
};

const ROLE_LABEL: Record<ProfileAppRole, string> = {
  user: "Usuário",
  admin: "Admin",
  master: "Master",
};

type AdminUsersTableProps = {
  users: AdminUserRow[];
  actorUserId: string;
  actorRole: ProfileAppRole;
};

export function AdminUsersTable({
  users,
  actorUserId,
  actorRole,
}: AdminUsersTableProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(
    userId: string,
    action: (id: string) => Promise<{ ok: boolean; error?: string; message?: string }>,
  ) {
    setPendingId(userId);
    startTransition(async () => {
      const result = await action(userId);
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível concluir a ação.");
        return;
      }
      toast.success(result.message ?? "Ação concluída.");
      router.refresh();
    });
  }

  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
        Nenhum usuário encontrado com os filtros atuais.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/50 bg-card shadow-sm">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead className="border-b border-border/60 bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Usuário</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Papel</th>
            <th className="px-4 py-3 font-medium">Cadastro</th>
            <th className="px-4 py-3 font-medium tabular-nums">Lançamentos</th>
            <th className="px-4 py-3 font-medium tabular-nums">Contas</th>
            <th className="px-4 py-3 font-medium tabular-nums">Importações</th>
            <th className="px-4 py-3 font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {users.map((user) => {
            const manageable = canManageAdminTarget({
              actorRole,
              actorUserId,
              targetUserId: user.id,
              targetRole: user.app_role,
            });
            const busy = isPending && pendingId === user.id;

            return (
              <tr key={user.id} className="align-top hover:bg-muted/20">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">
                    {user.full_name || "Sem nome"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.email || user.id}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      user.status === "active" &&
                        "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                      user.status === "inactive" &&
                        "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100",
                      user.status === "deleted" &&
                        "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-100",
                    )}
                  >
                    {STATUS_LABEL[user.status]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {ROLE_LABEL[user.app_role]}
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {formatDate(user.created_at)}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {user.transactions_count}
                </td>
                <td className="px-4 py-3 tabular-nums">{user.accounts_count}</td>
                <td className="px-4 py-3 tabular-nums">{user.imports_count}</td>
                <td className="px-4 py-3 text-right">
                  {manageable ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            disabled={busy}
                            aria-label={`Ações para ${user.email ?? user.id}`}
                          />
                        }
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <MoreHorizontal className="size-3.5" />
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {user.status !== "active" ? (
                          <DropdownMenuItem
                            onClick={() =>
                              runAction(user.id, reactivateUserAction)
                            }
                          >
                            Reativar
                          </DropdownMenuItem>
                        ) : null}
                        {user.status === "active" ? (
                          <DropdownMenuItem
                            onClick={() =>
                              runAction(user.id, inactivateUserAction)
                            }
                          >
                            Inativar
                          </DropdownMenuItem>
                        ) : null}
                        {user.status !== "deleted" ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Excluir logicamente ${user.email ?? "este usuário"}? Os dados permanecem no banco.`,
                                )
                              ) {
                                return;
                              }
                              runAction(user.id, softDeleteUserAction);
                            }}
                          >
                            Excluir logicamente
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
