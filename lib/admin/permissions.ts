import type { ProfileAppRole } from "@/types/profile";

export function canManageAdminTarget(input: {
  actorRole: ProfileAppRole;
  actorUserId: string;
  targetUserId: string;
  targetRole: ProfileAppRole;
}): boolean {
  if (input.targetUserId === input.actorUserId) return false;
  if (input.targetRole === "master") return input.actorRole === "master";
  if (input.targetRole === "admin") return input.actorRole === "master";
  return true;
}
