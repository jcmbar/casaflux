import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_FULL_NAME_LENGTH = 120;

export type UpdateFullNameResult =
  | { ok: true; fullName: string }
  | { ok: false; message: string };

export function validateFullName(raw: string): UpdateFullNameResult {
  const fullName = raw.trim().replace(/\s+/g, " ");

  if (!fullName) {
    return { ok: false, message: "Informe um nome." };
  }

  if (fullName.length > MAX_FULL_NAME_LENGTH) {
    return {
      ok: false,
      message: `O nome deve ter no máximo ${MAX_FULL_NAME_LENGTH} caracteres.`,
    };
  }

  return { ok: true, fullName };
}

/**
 * Persists the display name on `profiles` and mirrors it in auth user metadata.
 */
export async function updateFullName(
  supabase: SupabaseClient,
  userId: string,
  rawName: string,
): Promise<UpdateFullNameResult> {
  const validation = validateFullName(rawName);
  if (!validation.ok) {
    return validation;
  }

  const { fullName } = validation;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId);

  if (profileError) {
    return {
      ok: false,
      message: "Não foi possível salvar o nome. Tente novamente.",
    };
  }

  const { error: metaError } = await supabase.auth.updateUser({
    data: { full_name: fullName },
  });

  if (metaError) {
    // Profile already saved; metadata sync is best-effort for signup parity.
    console.error(metaError);
  }

  return { ok: true, fullName };
}
