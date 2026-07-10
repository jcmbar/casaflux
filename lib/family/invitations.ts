import { getSiteUrl } from "@/lib/supabase/env";
import type { FamilyInvitationPreview, FamilyRole } from "@/types/family";

export function buildInviteUrl(token: string) {
  return `${getSiteUrl()}/convite/${token}`;
}

export function parseInvitationPreview(data: unknown): FamilyInvitationPreview | null {
  if (!data || typeof data !== "object") return null;

  const row = data as Record<string, unknown>;
  const status = row.status;

  if (
    status !== "valid" &&
    status !== "expired" &&
    status !== "accepted" &&
    status !== "invalid"
  ) {
    return null;
  }

  return {
    status,
    familyName: typeof row.family_name === "string" ? row.family_name : null,
    role: (row.role as FamilyRole) ?? "member",
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    invitedEmail:
      typeof row.invited_email === "string" ? row.invited_email : null,
  };
}

export function parseAcceptResult(data: unknown) {
  if (!data || typeof data !== "object") return null;

  const row = data as Record<string, unknown>;
  const status = row.status;

  if (
    status !== "accepted" &&
    status !== "already_member"
  ) {
    return null;
  }

  return {
    status,
    familyId: typeof row.family_id === "string" ? row.family_id : null,
  };
}

export function mapInvitationError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("expired")) {
    return "Este convite expirou. Peça um novo convite ao administrador da família.";
  }

  if (normalized.includes("already accepted")) {
    return "Este convite já foi utilizado.";
  }

  if (normalized.includes("email does not match")) {
    return "O e-mail da sua conta não corresponde ao e-mail convidado.";
  }

  if (normalized.includes("invalid invitation")) {
    return "Convite inválido ou não encontrado.";
  }

  return "Não foi possível concluir o convite. Tente novamente.";
}
