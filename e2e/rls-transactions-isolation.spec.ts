import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";

import {
  getAdminClient,
  uniqueEmail,
  verifyAdminClient,
} from "./fixtures/supabase-admin";

const hasAdminEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const describeWithAdmin = hasAdminEnv ? test.describe : test.describe.skip;

describeWithAdmin("RLS — transactions isolation", () => {
  test.beforeAll(async () => {
    await verifyAdminClient();
  });

  test("user B cannot read user A personal transactions", async () => {
    const admin = getAdminClient();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const password = process.env.E2E_USER_PASSWORD ?? "TestPass123!";

    const emailA = uniqueEmail("rls-a");
    const emailB = uniqueEmail("rls-b");
    const markerA = `RLS_E2E_A_${Date.now()}`;
    const markerB = `RLS_E2E_B_${Date.now()}`;

    const { data: userA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
      user_metadata: { full_name: "RLS E2E A" },
    });
    const { data: userB } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
      user_metadata: { full_name: "RLS E2E B" },
    });

    const uidA = userA!.user!.id;
    const uidB = userB!.user!.id;

    const { data: accA } = await admin
      .from("accounts")
      .insert({
        name: "RLS E2E Conta A",
        type: "checking",
        balance: 0,
        owner_user_id: uidA,
        is_family_shared: false,
        family_id: null,
      })
      .select("id")
      .single();

    const { data: cat } = await admin
      .from("categories")
      .insert({ name: `RLS E2E Cat ${Date.now()}`, type: "expense" })
      .select("id")
      .single();

    await admin.from("transactions").insert({
      description: markerA,
      amount: 10,
      type: "expense",
      account_id: accA!.id,
      category_id: cat!.id,
      created_by: uidA,
      transaction_date: new Date().toISOString().slice(0, 10),
    });

    const slug = `rls-e2e-${Date.now()}`;
    const { data: famB } = await admin
      .from("families")
      .insert({ name: "RLS E2E Fam B", slug, created_by: uidB })
      .select("id")
      .single();

    await admin.from("family_members").insert({
      family_id: famB!.id,
      user_id: uidB,
      role: "owner",
      can_invite: true,
    });

    const { data: accB } = await admin
      .from("accounts")
      .insert({
        name: "RLS E2E Conta B",
        type: "checking",
        balance: 0,
        family_id: famB!.id,
        is_family_shared: true,
        allow_family_view: true,
        allow_family_post: true,
        allow_family_edit: true,
        owner_user_id: null,
      })
      .select("id")
      .single();

    await admin.from("transactions").insert({
      description: markerB,
      amount: 20,
      type: "expense",
      account_id: accB!.id,
      category_id: cat!.id,
      created_by: uidB,
      transaction_date: new Date().toISOString().slice(0, 10),
    });

    const clientB = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await clientB.auth.signInWithPassword({ email: emailB, password });

    const { data: txB, error } = await clientB
      .from("transactions")
      .select("description, accounts(name)");

    expect(error).toBeNull();
    expect(txB?.some((row) => row.description === markerB)).toBe(true);
    expect(txB?.some((row) => row.description === markerA)).toBe(false);

    const legacyNames = ["Nubank", "Cartão de Crédito", "Conta Corrente"];
    const leakedLegacy = (txB ?? []).filter((row) =>
      legacyNames.includes(row.accounts?.name ?? ""),
    );
    expect(leakedLegacy).toHaveLength(0);

    await admin.from("families").delete().eq("id", famB!.id);
    await admin.from("categories").delete().eq("id", cat!.id);
    await admin.from("accounts").delete().eq("id", accA!.id);
    await admin.auth.admin.deleteUser(uidA);
    await admin.auth.admin.deleteUser(uidB);
  });
});
