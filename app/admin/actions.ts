"use server";

import { revalidatePath } from "next/cache";

import {
  requirePlatformAdmin,
  setAdminUserStatus,
} from "@/lib/admin/users";
import type { ProfileStatus } from "@/types/profile";

export type AdminActionState = {
  ok: boolean;
  error?: string;
  message?: string;
};

async function runStatusAction(
  targetUserId: string,
  nextStatus: ProfileStatus,
  successMessage: string,
): Promise<AdminActionState> {
  await requirePlatformAdmin();

  if (!targetUserId) {
    return { ok: false, error: "Usuário inválido." };
  }

  const result = await setAdminUserStatus({
    targetUserId,
    nextStatus,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/admin/usuarios");
  return { ok: true, message: successMessage };
}

export async function inactivateUserAction(
  targetUserId: string,
): Promise<AdminActionState> {
  return runStatusAction(
    targetUserId,
    "inactive",
    "Usuário inativado.",
  );
}

export async function reactivateUserAction(
  targetUserId: string,
): Promise<AdminActionState> {
  return runStatusAction(
    targetUserId,
    "active",
    "Usuário reativado.",
  );
}

export async function softDeleteUserAction(
  targetUserId: string,
): Promise<AdminActionState> {
  return runStatusAction(
    targetUserId,
    "deleted",
    "Usuário excluído logicamente.",
  );
}
