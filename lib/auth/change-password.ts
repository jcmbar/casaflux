import type { SupabaseClient } from "@supabase/supabase-js";

/** Matches Supabase Auth `minimum_password_length` (config.toml). */
export const MIN_PASSWORD_LENGTH = 6;

export type ChangePasswordFields = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type ChangePasswordValidation =
  | { ok: true }
  | {
      ok: false;
      message: string;
      field?: keyof ChangePasswordFields;
    };

export function validateChangePassword(
  fields: ChangePasswordFields,
): ChangePasswordValidation {
  const currentPassword = fields.currentPassword;
  const newPassword = fields.newPassword;
  const confirmPassword = fields.confirmPassword;

  if (!currentPassword) {
    return {
      ok: false,
      field: "currentPassword",
      message: "Informe a senha atual.",
    };
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      field: "newPassword",
      message: `A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      ok: false,
      field: "confirmPassword",
      message: "A confirmação não coincide com a nova senha.",
    };
  }

  if (newPassword === currentPassword) {
    return {
      ok: false,
      field: "newPassword",
      message: "A nova senha deve ser diferente da senha atual.",
    };
  }

  return { ok: true };
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Verifies the current password, then updates via Supabase Auth.
 * Flow: `signInWithPassword` (reauth) → `updateUser({ password })`.
 */
export async function changePassword(
  supabase: SupabaseClient,
  email: string,
  fields: ChangePasswordFields,
): Promise<ChangePasswordResult> {
  const validation = validateChangePassword(fields);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: fields.currentPassword,
  });

  if (reauthError) {
    return { ok: false, message: "Senha atual incorreta." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: fields.newPassword,
  });

  if (updateError) {
    return {
      ok: false,
      message:
        updateError.message?.trim() ||
        "Não foi possível alterar a senha. Tente novamente.",
    };
  }

  return { ok: true };
}
