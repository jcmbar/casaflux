import type { EmailOtpType } from "@supabase/supabase-js";

const PASSWORD_SETUP_TYPES = new Set<EmailOtpType>(["recovery", "invite"]);

export function defaultAuthConfirmPathForType(
  type: EmailOtpType | null,
): string {
  if (type && PASSWORD_SETUP_TYPES.has(type)) {
    return "/set-password";
  }
  return "/dashboard";
}

/**
 * Only allow same-origin relative paths (e.g. `/set-password`).
 * Rejects protocol-relative and absolute URLs.
 */
export function sanitizeAuthRedirectPath(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://")) return fallback;
  return trimmed;
}

export function resolveAuthConfirmRedirect(input: {
  type: EmailOtpType | null;
  redirectTo: string | null;
  next: string | null;
}): string {
  const fallback = defaultAuthConfirmPathForType(input.type);
  return sanitizeAuthRedirectPath(
    input.redirectTo || input.next,
    fallback,
  );
}
