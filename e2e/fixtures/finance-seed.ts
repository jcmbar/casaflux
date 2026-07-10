import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createOwnerWithFamily,
  deleteUser,
} from "./supabase-admin";

type FinanceWorkspace = {
  owner: Awaited<ReturnType<typeof createOwnerWithFamily>>["owner"];
  family: Awaited<ReturnType<typeof createOwnerWithFamily>>["family"];
  password: string;
  category: { id: string; name: string };
  account: { id: string; name: string };
};

export async function createExpenseCategory(
  admin: SupabaseClient,
  { name }: { name: string },
) {
  const { data, error } = await admin
    .from("categories")
    .insert({
      name,
      type: "expense",
    })
    .select("id, name")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create category: ${error?.message}`);
  }

  return data;
}

export async function createFamilySharedAccount(
  admin: SupabaseClient,
  {
    familyId,
    name,
    balance = 0,
  }: {
    familyId: string;
    name: string;
    balance?: number;
  },
) {
  const { data, error } = await admin
    .from("accounts")
    .insert({
      name,
      type: "checking",
      balance,
      family_id: familyId,
      is_family_shared: true,
      allow_family_view: true,
      allow_family_post: true,
      allow_family_edit: true,
      owner_user_id: null,
    })
    .select("id, name")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create account: ${error?.message}`);
  }

  return data;
}

export async function createPersonalAccount(
  admin: SupabaseClient,
  {
    userId,
    name,
    balance = 0,
  }: {
    userId: string;
    name: string;
    balance?: number;
  },
) {
  const { data, error } = await admin
    .from("accounts")
    .insert({
      name,
      type: "checking",
      balance,
      owner_user_id: userId,
      is_family_shared: false,
      family_id: null,
    })
    .select("id, name")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create personal account: ${error?.message}`);
  }

  return data;
}

export async function createFinanceWorkspace(
  admin: SupabaseClient,
  {
    ownerEmail,
    familyName = "Família Finance E2E",
    categoryName = "Alimentação E2E",
    accountName = "Conta Família E2E",
    ...ownerOptions
  }: Parameters<typeof createOwnerWithFamily>[1] & {
    categoryName?: string;
    accountName?: string;
  },
): Promise<FinanceWorkspace> {
  const { owner, family, password } = await createOwnerWithFamily(admin, {
    ownerEmail,
    familyName,
    ...ownerOptions,
  });

  const category = await createExpenseCategory(admin, { name: categoryName });
  const account = await createFamilySharedAccount(admin, {
    familyId: family.id,
    name: accountName,
  });

  return { owner, family, password, category, account };
}

export async function deleteFinanceWorkspace(
  admin: SupabaseClient,
  {
    ownerId,
    familyId,
    categoryId,
  }: {
    ownerId: string;
    familyId: string;
    categoryId: string;
  },
) {
  await admin.from("families").delete().eq("id", familyId);
  await admin.from("categories").delete().eq("id", categoryId);
  await deleteUser(admin, ownerId);
}

export async function createAdditionalFamilyForUser(
  admin: SupabaseClient,
  {
    userId,
    familyName,
    accountName,
  }: {
    userId: string;
    familyName: string;
    accountName: string;
  },
) {
  const slug = `e2e-extra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const { data: family, error: familyError } = await admin
    .from("families")
    .insert({
      name: familyName,
      slug,
      created_by: userId,
    })
    .select("id, name")
    .single();

  if (familyError || !family) {
    throw new Error(`Failed to create extra family: ${familyError?.message}`);
  }

  const { error: memberError } = await admin.from("family_members").insert({
    family_id: family.id,
    user_id: userId,
    role: "owner",
    can_invite: true,
  });

  if (memberError) {
    throw new Error(`Failed to add user to extra family: ${memberError.message}`);
  }

  const account = await createFamilySharedAccount(admin, {
    familyId: family.id,
    name: accountName,
  });

  return { family, account };
}

export async function hideAccountFromFamilyView(
  admin: SupabaseClient,
  accountId: string,
) {
  const { error } = await admin
    .from("accounts")
    .update({ allow_family_view: false })
    .eq("id", accountId);

  if (error) {
    throw new Error(`Failed to hide account from family view: ${error.message}`);
  }
}
