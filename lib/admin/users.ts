import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  isPlatformAdminRole,
  type Profile,
  type ProfileAppRole,
  type ProfileStatus,
} from "@/types/profile";

export type AdminUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  status: ProfileStatus;
  app_role: ProfileAppRole;
  created_at: string;
  status_changed_at: string | null;
  deleted_at: string | null;
  transactions_count: number;
  accounts_count: number;
  imports_count: number;
};

export type AdminUserStats = {
  total_users: number;
  active_users: number;
  inactive_users: number;
  deleted_users: number;
};

export type AdminActor = {
  userId: string;
  profile: Profile;
};

function mapStats(row: Record<string, unknown> | null): AdminUserStats {
  return {
    total_users: Number(row?.total_users ?? 0),
    active_users: Number(row?.active_users ?? 0),
    inactive_users: Number(row?.inactive_users ?? 0),
    deleted_users: Number(row?.deleted_users ?? 0),
  };
}

function mapUserRow(row: Record<string, unknown>): AdminUserRow {
  return {
    id: String(row.id),
    email: (row.email as string | null) ?? null,
    full_name: (row.full_name as string | null) ?? null,
    status: row.status as ProfileStatus,
    app_role: row.app_role as ProfileAppRole,
    created_at: String(row.created_at),
    status_changed_at: (row.status_changed_at as string | null) ?? null,
    deleted_at: (row.deleted_at as string | null) ?? null,
    transactions_count: Number(row.transactions_count ?? 0),
    accounts_count: Number(row.accounts_count ?? 0),
    imports_count: Number(row.imports_count ?? 0),
  };
}

export async function requirePlatformAdmin(): Promise<AdminActor> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/usuarios");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    redirect("/dashboard");
  }

  const typed = profile as Profile;

  if (
    typed.status !== "active" ||
    !isPlatformAdminRole(typed.app_role)
  ) {
    redirect("/dashboard");
  }

  return { userId: user.id, profile: typed };
}

export async function fetchAdminUserStats(): Promise<AdminUserStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_user_stats");

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return mapStats((row as Record<string, unknown> | null) ?? null);
}

export async function fetchAdminUsers(input: {
  search?: string | null;
  status?: ProfileStatus | "all" | null;
}): Promise<AdminUserRow[]> {
  const supabase = await createClient();
  const status =
    input.status && input.status !== "all" ? input.status : null;

  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: input.search?.trim() || null,
    p_status: status,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Record<string, unknown>[] | null) ?? []).map(mapUserRow);
}

export async function setAdminUserStatus(input: {
  targetUserId: string;
  nextStatus: ProfileStatus;
  reason?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_status", {
    p_target_user_id: input.targetUserId,
    p_next_status: input.nextStatus,
    p_reason: input.reason?.trim() || null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
