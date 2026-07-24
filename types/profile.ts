export type ProfileAppRole = "user" | "admin" | "master";

export type ProfileStatus = "active" | "inactive" | "deleted";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  app_role?: ProfileAppRole;
  status?: ProfileStatus;
  status_changed_at?: string | null;
  status_changed_by?: string | null;
  deleted_at?: string | null;
};

export function isPlatformAdminRole(
  role: string | null | undefined,
): role is "admin" | "master" {
  return role === "admin" || role === "master";
}
