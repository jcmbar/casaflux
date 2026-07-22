import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getSiteUrl } from "@/lib/supabase/env";

export type ChangeEmailResult =
  | { ok: true; pendingEmail: string }
  | { ok: false; message: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmailChange(
  rawEmail: string,
  currentEmail: string | null | undefined,
): ChangeEmailResult {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return { ok: false, message: "Informe o novo e-mail." };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, message: "Informe um e-mail válido." };
  }

  const current = normalizeEmail(currentEmail ?? "");
  if (current && email === current) {
    return {
      ok: false,
      message: "O novo e-mail deve ser diferente do atual.",
    };
  }

  return { ok: true, pendingEmail: email };
}

export function getPendingEmailChange(user: User | null | undefined): string | null {
  const pending = user?.new_email?.trim();
  return pending ? pending : null;
}

/**
 * Requests an email change via Supabase Auth (same confirmation path as signup).
 * With `double_confirm_changes`, both current and new addresses must confirm.
 * Profile.email is synced by DB trigger only after auth.users.email updates.
 */
export async function requestEmailChange(
  supabase: SupabaseClient,
  rawEmail: string,
  currentEmail: string | null | undefined,
): Promise<ChangeEmailResult> {
  const validation = validateEmailChange(rawEmail, currentEmail);
  if (!validation.ok) {
    return validation;
  }

  const emailRedirectTo = `${getSiteUrl()}/auth/callback?next=${encodeURIComponent("/configuracoes")}`;

  const { data, error } = await supabase.auth.updateUser(
    { email: validation.pendingEmail },
    { emailRedirectTo },
  );

  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered")) {
      return { ok: false, message: "Este e-mail já está em uso." };
    }

    return {
      ok: false,
      message:
        error.message?.trim() ||
        "Não foi possível solicitar a alteração de e-mail. Tente novamente.",
    };
  }

  const pending =
    data.user?.new_email?.trim() || validation.pendingEmail;

  return { ok: true, pendingEmail: pending };
}
