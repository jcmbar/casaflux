"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  Mail,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { PageIntro } from "@/components/layout/page-intro";
import { useConfirm } from "@/components/feedback/confirm-dialog-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppContext } from "@/contexts/app-context";
import { buildInviteUrl } from "@/lib/family/invitations";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type {
  FamilyInvitation,
  FamilyMemberWithProfile,
  FamilyRole,
} from "@/types/family";

const roleLabels: Record<FamilyRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Membro",
};

const roleBadgeClass: Record<FamilyRole, string> = {
  owner: "border-primary/25 bg-primary/5 text-primary",
  admin: "border-border bg-muted/60 text-foreground",
  member: "border-border/60 text-muted-foreground",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function CardIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
      {children}
    </div>
  );
}

export default function FamiliaPage() {
  const supabase = useMemo(() => createClient()!, []);
  const confirm = useConfirm();
  const { activeFamily, canInvite, refresh } = useAppContext();
  const [members, setMembers] = useState<FamilyMemberWithProfile[]>([]);
  const [invitations, setInvitations] = useState<FamilyInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    role: "member" as "member" | "admin",
  });

  const loadData = useCallback(async () => {
    if (!activeFamily) {
      setMembers([]);
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [membersRes, invitationsRes] = await Promise.all([
      supabase
        .from("family_members")
        .select("*")
        .eq("family_id", activeFamily.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("family_invitations")
        .select("*")
        .eq("family_id", activeFamily.id)
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    if (membersRes.error) {
      console.error(membersRes.error);
      setError("Não foi possível carregar os membros.");
      setMembers([]);
    } else {
      const rawMembers = membersRes.data ?? [];
      const userIds = rawMembers.map((member) => member.user_id);

      let profileMap = new Map<string, { full_name: string | null; email: string | null }>();

      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);

        if (profilesError) {
          console.error(profilesError);
        } else {
          profileMap = new Map(
            (profilesData ?? []).map((profile) => [profile.id, profile]),
          );
        }
      }

      setMembers(
        rawMembers.map((member) => ({
          ...member,
          profiles: profileMap.get(member.user_id) ?? null,
        })) as FamilyMemberWithProfile[],
      );
    }

    if (invitationsRes.error) {
      console.error(invitationsRes.error);
    } else {
      setInvitations((invitationsRes.data ?? []) as FamilyInvitation[]);
    }

    setLoading(false);
  }, [activeFamily, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeFamily || !canInvite) return;

    setSaving(true);
    setError(null);

    const { data, error: inviteError } = await supabase.rpc(
      "create_family_invitation",
      {
        p_family_id: activeFamily.id,
        p_email: form.email.trim(),
        p_role: form.role,
      },
    );

    if (inviteError || !data?.[0]) {
      console.error(inviteError);
      setError("Não foi possível criar o convite.");
      setSaving(false);
      return;
    }

    const created = data[0] as {
      token: string;
    };

    try {
      await navigator.clipboard.writeText(buildInviteUrl(created.token));
    } catch (clipboardError) {
      console.warn("Could not copy invite link to clipboard:", clipboardError);
    }

    setCopiedToken(created.token);
    setForm({ email: "", role: "member" });
    await loadData();
    setSaving(false);
    toast.success("Convite criado com sucesso.");
  }

  async function handleCopyInvite(token: string) {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(token));
    } catch (clipboardError) {
      console.warn("Could not copy invite link to clipboard:", clipboardError);
    }
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  async function handleRevoke(invitationId: string) {
    const confirmed = await confirm({
      title: "Revogar convite",
      description: "Revogar este convite pendente?",
      confirmLabel: "Revogar",
      destructive: true,
    });

    if (!confirmed) return;

    const { error: revokeError } = await supabase.rpc(
      "revoke_family_invitation",
      {
        p_invitation_id: invitationId,
      },
    );

    if (revokeError) {
      console.error(revokeError);
      toast.error("Não foi possível revogar o convite.");
      return;
    }

    await loadData();
    toast.success("Convite revogado.");
  }

  if (!activeFamily) {
    return (
      <div className="space-y-6 md:space-y-8">
        <PageIntro description="Membros, convites e permissões da família ativa." />
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-5" />
          </div>
          <p className="text-sm font-medium">Nenhuma família selecionada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Selecione ou crie uma família para gerenciar membros e convites.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageIntro description="Membros, convites e permissões da família ativa." />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="animate-enter border-border/50 shadow-sm">
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Família ativa</p>
            <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {activeFamily.name}
            </p>
          </div>
          <div className="space-y-1 sm:text-right">
            <p className="text-sm text-muted-foreground">Membros</p>
            <p className="text-2xl font-semibold tabular-nums sm:text-3xl">
              {loading ? "—" : members.length}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="animate-enter-delayed border-border/50 shadow-sm">
        <CardHeader className="space-y-4">
          <CardIcon>
            <Users className="size-5" />
          </CardIcon>
          <CardTitle className="text-lg font-semibold">Membros</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando membros...
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum membro encontrado nesta família.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {members.map((member) => {
                const displayName =
                  member.profiles?.full_name?.trim() ||
                  member.profiles?.email ||
                  "Membro";

                return (
                  <div
                    key={member.id}
                    className="group -mx-2 flex flex-col gap-3 rounded-xl px-2 py-4 transition-colors first:pt-2 last:pb-2 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                        {getInitials(displayName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{displayName}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {member.profiles?.email ?? "Sem e-mail"}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(roleBadgeClass[member.role])}
                    >
                      {roleLabels[member.role]}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {canInvite ? (
        <>
          <Card className="animate-enter-delayed border-border/50 shadow-sm">
            <CardHeader className="space-y-4">
              <CardIcon>
                <UserPlus className="size-5" />
              </CardIcon>
              <CardTitle className="text-lg font-semibold">
                Convidar membro
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateInvite} className="space-y-5">
                <FormInput
                id="invite-email"
                label="E-mail do convidado"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                placeholder="pessoa@email.com"
                data-testid="invite-email"
                required
              />

                <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
                  <FormSelect
                    id="invite-role"
                    label="Papel"
                    value={form.role}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        role: event.target.value as "member" | "admin",
                      }))
                    }
                  >
                    <option value="member">Membro</option>
                    <option value="admin">Admin</option>
                  </FormSelect>

                  <Button
                    type="submit"
                    disabled={saving}
                    className="w-full shadow-sm sm:w-auto"
                    data-testid="invite-submit"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        Gerar convite
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground">
                  O link do convite será copiado automaticamente. Validade: 7
                  dias. O convite só pode ser aceito com o mesmo e-mail
                  informado.
                </p>
              </form>
            </CardContent>
          </Card>

          <Card className="animate-enter-delayed border-border/50 shadow-sm">
            <CardHeader className="space-y-4">
              <CardIcon>
                <Mail className="size-5" />
              </CardIcon>
              <CardTitle className="text-lg font-semibold">
                Convites pendentes
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {invitations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nenhum convite pendente no momento.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      data-testid="pending-invite"
                      className="group -mx-2 flex flex-col gap-3 rounded-xl px-2 py-4 transition-colors first:pt-2 last:pb-2 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {invitation.email}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {roleLabels[invitation.role]} · expira em{" "}
                          {formatDate(invitation.expires_at.slice(0, 10))}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyInvite(invitation.token)}
                        >
                          {copiedToken === invitation.token ? (
                            <>
                              <Check className="h-4 w-4" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              Copiar link
                            </>
                          )}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevoke(invitation.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Revogar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="animate-enter-delayed border-border/40 bg-muted/30 shadow-none">
          <CardContent className="py-6 text-sm leading-relaxed text-muted-foreground">
            Você pode visualizar os membros, mas não tem permissão para enviar
            convites nesta família.
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => refresh()}>
          Atualizar
        </Button>
      </div>
    </div>
  );
}
