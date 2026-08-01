import { type EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { resolveAuthConfirmRedirect } from "@/lib/auth/confirm-redirect";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const type = (typeParam as EmailOtpType | null) ?? null;
  const redirectPath = resolveAuthConfirmRedirect({
    type,
    redirectTo: searchParams.get("redirect_to"),
    next: searchParams.get("next"),
  });

  const loginFallback = new URL("/login?error=auth_confirm_error", request.url);

  if (!tokenHash || !type) {
    return NextResponse.redirect(loginFallback);
  }

  const { url, anonKey } = getSupabaseEnv();
  let response = NextResponse.redirect(new URL(redirectPath, request.url));

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.redirect(new URL(redirectPath, request.url));
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    console.error("auth/confirm verifyOtp failed:", error.message);
    return NextResponse.redirect(loginFallback);
  }

  return response;
}
