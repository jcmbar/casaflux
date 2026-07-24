import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseEnv } from "./env";

const AUTH_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
];

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isPublicRoute(pathname: string) {
  return pathname === "/convite" || pathname.startsWith("/convite/");
}

function isAdminRoute(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isBlockedAccountRoute(pathname: string) {
  return pathname === "/conta-bloqueada";
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        supabaseResponse = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const publicRoute = isPublicRoute(pathname);
  const adminRoute = isAdminRoute(pathname);
  const blockedRoute = isBlockedAccountRoute(pathname);

  if (!user && !isAuthRoute(pathname) && !publicRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";

    if (pathname !== "/") {
      redirectUrl.searchParams.set("redirectTo", pathname);
    }

    return NextResponse.redirect(redirectUrl);
  }

  if (
    user &&
    isAuthRoute(pathname) &&
    pathname !== "/reset-password" &&
    !pathname.startsWith("/auth/callback")
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && !isAuthRoute(pathname) && !publicRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("status, app_role")
      .eq("id", user.id)
      .maybeSingle();

    const status = (profile as { status?: string } | null)?.status ?? "active";
    const appRole = (profile as { app_role?: string } | null)?.app_role;
    const accountBlocked = status === "inactive" || status === "deleted";

    if (accountBlocked && !blockedRoute) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/conta-bloqueada";
      return NextResponse.redirect(redirectUrl);
    }

    if (!accountBlocked && blockedRoute) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      return NextResponse.redirect(redirectUrl);
    }

    if (adminRoute) {
      const isPlatformAdmin =
        status === "active" &&
        (appRole === "admin" || appRole === "master");

      if (!isPlatformAdmin) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }

      return supabaseResponse;
    }

    if (accountBlocked) {
      return supabaseResponse;
    }

    const isPlatformAdmin =
      status === "active" &&
      (appRole === "admin" || appRole === "master");

    if (pathname !== "/onboarding" && !isPlatformAdmin) {
      const { count } = await supabase
        .from("family_members")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (!count) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/onboarding";
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  if (user && pathname === "/onboarding") {
    const { count } = await supabase
      .from("family_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (count && count > 0) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}
