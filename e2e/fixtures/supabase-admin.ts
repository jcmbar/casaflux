import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_PASSWORD = process.env.E2E_USER_PASSWORD ?? "TestPass123!";

export function requireE2EEnv() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      [
        "E2E requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
        "Get the service_role key from Supabase → Settings → API (not the anon key).",
      ].join(" "),
    );
  }
}

export async function verifyAdminClient() {
  requireE2EEnv();

  const admin = getAdminClient();
  const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });

  if (error?.message?.toLowerCase().includes("invalid api key")) {
    throw new Error(
      [
        "SUPABASE_SERVICE_ROLE_KEY is invalid.",
        "Use the service_role secret from Supabase → Settings → API.",
        "Do not use NEXT_PUBLIC_SUPABASE_ANON_KEY here.",
      ].join(" "),
    );
  }

  if (error) {
    throw new Error(`Supabase admin check failed: ${error.message}`);
  }
}

export function getAdminClient(): SupabaseClient {
  requireE2EEnv();

  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export async function createConfirmedUser(
  admin: SupabaseClient,
  {
    email,
    password = DEFAULT_PASSWORD,
    fullName,
  }: {
    email: string;
    password?: string;
    fullName: string;
  },
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    throw new Error(`Failed to create user ${email}: ${error?.message}`);
  }

  return data.user;
}

export async function deleteUser(admin: SupabaseClient, userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.warn(`Failed to delete user ${userId}:`, error.message);
  }
}

export async function createOwnerWithFamily(
  admin: SupabaseClient,
  {
    ownerEmail,
    ownerName = "Owner E2E",
    familyName = "Família E2E",
    password = DEFAULT_PASSWORD,
  }: {
    ownerEmail: string;
    ownerName?: string;
    familyName?: string;
    password?: string;
  },
) {
  const owner = await createConfirmedUser(admin, {
    email: ownerEmail,
    password,
    fullName: ownerName,
  });

  const slug = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const { data: family, error: familyError } = await admin
    .from("families")
    .insert({
      name: familyName,
      slug,
      created_by: owner.id,
    })
    .select("*")
    .single();

  if (familyError || !family) {
    await deleteUser(admin, owner.id);
    throw new Error(`Failed to create family: ${familyError?.message}`);
  }

  const { error: memberError } = await admin.from("family_members").insert({
    family_id: family.id,
    user_id: owner.id,
    role: "owner",
    can_invite: true,
  });

  if (memberError) {
    await admin.from("families").delete().eq("id", family.id);
    await deleteUser(admin, owner.id);
    throw new Error(`Failed to create family member: ${memberError.message}`);
  }

  return { owner, family, password };
}

export async function createInvitation(
  admin: SupabaseClient,
  {
    familyId,
    email,
    invitedBy,
    token,
    role = "member",
  }: {
    familyId: string;
    email: string;
    invitedBy: string;
    token: string;
    role?: "member" | "admin";
  },
) {
  const { data, error } = await admin
    .from("family_invitations")
    .insert({
      family_id: familyId,
      email: email.toLowerCase().trim(),
      role,
      token,
      invited_by: invitedBy,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("token, email")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create invitation: ${error?.message}`);
  }

  return data;
}

export async function revokeInvitationByToken(
  admin: SupabaseClient,
  token: string,
) {
  await admin.from("family_invitations").delete().eq("token", token);
}

export async function getFamilyMemberCount(
  admin: SupabaseClient,
  familyId: string,
) {
  const { count, error } = await admin
    .from("family_members")
    .select("*", { count: "exact", head: true })
    .eq("family_id", familyId);

  if (error) {
    throw new Error(`Failed to count members: ${error.message}`);
  }

  return count ?? 0;
}
