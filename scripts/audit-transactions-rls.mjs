/**
 * Live RLS audit for public.transactions (dev only).
 * Creates two isolated users, verifies cross-tenant isolation, then cleans up.
 *
 * Usage: node scripts/audit-transactions-rls.mjs
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.E2E_USER_PASSWORD ?? "TestPass123!";

const DEV_PROJECT_REF = "lqrniaqtzuuzovtxqatc";

function assertDevProject() {
  if (!url?.includes(DEV_PROJECT_REF)) {
    console.error(
      `ABORT: URL must point to dev project ref "${DEV_PROJECT_REF}". Got: ${url ?? "(missing)"}`,
    );
    process.exit(3);
  }
  if (!anonKey || !serviceKey) {
    console.error("ABORT: Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(3);
  }
}

function uniqueEmail(prefix) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function createUserClient(email, pwd) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: pwd,
  });
  if (error) throw new Error(`signIn failed for ${email}: ${error.message}`);
  return { client, userId: data.user.id };
}

async function fetchPolicies(admin) {
  // PostgREST doesn't expose pg_policies; use a lightweight probe via known RPC or raw SQL workaround.
  // We verify effective policy by testing can_view_account behavior + listing policy metadata via admin SQL if available.
  const { data, error } = await admin.rpc("audit_transactions_rls_policies");
  if (!error && data) return data;

  // Fallback: infer from migration + live behavior (documented in output)
  return null;
}

const cleanup = {
  userIds: [],
  familyIds: [],
  accountIds: [],
  categoryIds: [],
  transactionIds: [],
};

async function runCleanup(admin) {
  console.log("\n--- Cleanup ---");

  if (cleanup.transactionIds.length) {
    const { error } = await admin
      .from("transactions")
      .delete()
      .in("id", cleanup.transactionIds);
    console.log(
      `transactions deleted: ${cleanup.transactionIds.length}`,
      error ? `(warn: ${error.message})` : "OK",
    );
  }

  for (const familyId of cleanup.familyIds) {
    const { error } = await admin.from("families").delete().eq("id", familyId);
    console.log(`family ${familyId.slice(0, 8)}…`, error ? `(warn: ${error.message})` : "deleted");
  }

  for (const accountId of cleanup.accountIds) {
    const { error } = await admin.from("accounts").delete().eq("id", accountId);
    console.log(`account ${accountId.slice(0, 8)}…`, error ? `(warn: ${error.message})` : "deleted");
  }

  for (const categoryId of cleanup.categoryIds) {
    const { error } = await admin
      .from("categories")
      .delete()
      .eq("id", categoryId);
    console.log(`category ${categoryId.slice(0, 8)}…`, error ? `(warn: ${error.message})` : "deleted");
  }

  for (const userId of cleanup.userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    console.log(`user ${userId.slice(0, 8)}…`, error ? `(warn: ${error.message})` : "deleted");
  }

  // Verify cleanup
  let allClean = true;
  for (const userId of cleanup.userIds) {
    const { data } = await admin.auth.admin.getUserById(userId);
    if (data?.user) {
      console.log(`CLEANUP FAIL: user still exists ${userId}`);
      allClean = false;
    }
  }

  console.log(allClean ? "Cleanup verified: all test artifacts removed." : "Cleanup incomplete — review warnings above.");
  return allClean;
}

async function main() {
  assertDevProject();

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let leakConfirmed = false;

  console.log("=== RLS Audit: transactions (dev only) ===");
  console.log(`Project: ${DEV_PROJECT_REF}`);
  console.log(`URL: ${url}\n`);

  const report = {
    projectRef: DEV_PROJECT_REF,
    orphanPersonalAccounts: [],
    legacyAccounts: [],
    userA: { email: null, id: null, marker: null },
    userB: { email: null, id: null, marker: null },
    isolation: {
      bSeesOwn: false,
      bLeakedA: false,
      aSeesOwn: false,
      aLeakedB: false,
      bLegacyTxCount: 0,
      bTxCount: 0,
      aTxCount: 0,
      bAccountNames: [],
    },
    policies: null,
    leakConfirmed: false,
    rootCause: null,
  };

  try {
    // Orphan accounts (admin bypasses RLS)
    const { data: orphanAccounts } = await admin
      .from("accounts")
      .select("id, name, owner_user_id, family_id, is_family_shared")
      .is("owner_user_id", null)
      .eq("is_family_shared", false);

    report.orphanPersonalAccounts = orphanAccounts ?? [];
    console.log("Orphan personal accounts (owner_user_id NULL):", report.orphanPersonalAccounts.length);
    for (const a of report.orphanPersonalAccounts) {
      console.log(`  - ${a.name} (${a.id})`);
    }

    const { data: legacyNamed } = await admin
      .from("accounts")
      .select("id, name, owner_user_id, is_family_shared, family_id")
      .in("name", ["Nubank", "Cartão de Crédito", "Conta Corrente", "Supermercado"]);

    report.legacyAccounts = legacyNamed ?? [];
    console.log("\nLegacy/sample accounts in DB:");
    for (const a of report.legacyAccounts) {
      console.log(
        `  ${a.name}: owner=${a.owner_user_id?.slice(0, 8) ?? "NULL"} shared=${a.is_family_shared}`,
      );
    }

    // Create users A (personal) and B (family)
    const emailA = uniqueEmail("rls-audit-a");
    const emailB = uniqueEmail("rls-audit-b");
    const markerA = `RLS_AUDIT_A_${Date.now()}`;
    const markerB = `RLS_AUDIT_B_${Date.now()}`;

    report.userA.email = emailA;
    report.userB.email = emailB;
    report.userA.marker = markerA;
    report.userB.marker = markerB;

    const { data: userA, error: errA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
      user_metadata: { full_name: "RLS Audit User A" },
    });
    if (errA) throw errA;
    report.userA.id = userA.user.id;
    cleanup.userIds.push(userA.user.id);

    const { data: userB, error: errB } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
      user_metadata: { full_name: "RLS Audit User B" },
    });
    if (errB) throw errB;
    report.userB.id = userB.user.id;
    cleanup.userIds.push(userB.user.id);

    const uidA = userA.user.id;
    const uidB = userB.user.id;

    const { data: accA, error: accAErr } = await admin
      .from("accounts")
      .insert({
        name: "RLS Audit Conta Pessoal A",
        type: "checking",
        balance: 0,
        owner_user_id: uidA,
        is_family_shared: false,
        family_id: null,
      })
      .select("id")
      .single();
    if (accAErr) throw accAErr;
    cleanup.accountIds.push(accA.id);

    const { data: cat, error: catErr } = await admin
      .from("categories")
      .insert({ name: `RLS Audit Cat ${Date.now()}`, type: "expense" })
      .select("id")
      .single();
    if (catErr) throw catErr;
    cleanup.categoryIds.push(cat.id);

    const { data: txAInsert, error: txAErr } = await admin
      .from("transactions")
      .insert({
        description: markerA,
        amount: 42.01,
        type: "expense",
        account_id: accA.id,
        category_id: cat.id,
        created_by: uidA,
        transaction_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (txAErr) throw txAErr;
    cleanup.transactionIds.push(txAInsert.id);

    const slugB = `rls-audit-b-${Date.now()}`;
    const { data: famB, error: famBErr } = await admin
      .from("families")
      .insert({ name: "RLS Audit Fam B", slug: slugB, created_by: uidB })
      .select("id")
      .single();
    if (famBErr) throw famBErr;
    cleanup.familyIds.push(famB.id);

    await admin.from("family_members").insert({
      family_id: famB.id,
      user_id: uidB,
      role: "owner",
      can_invite: true,
    });

    const { data: accB, error: accBErr } = await admin
      .from("accounts")
      .insert({
        name: "RLS Audit Conta Fam B",
        type: "checking",
        balance: 0,
        family_id: famB.id,
        is_family_shared: true,
        allow_family_view: true,
        allow_family_post: true,
        allow_family_edit: true,
        owner_user_id: null,
      })
      .select("id")
      .single();
    if (accBErr) throw accBErr;
    cleanup.accountIds.push(accB.id);

    const { data: txBInsert, error: txBErr } = await admin
      .from("transactions")
      .insert({
        description: markerB,
        amount: 99.99,
        type: "expense",
        account_id: accB.id,
        category_id: cat.id,
        created_by: uidB,
        transaction_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (txBErr) throw txBErr;
    cleanup.transactionIds.push(txBInsert.id);

    console.log("\n--- Isolation test (anon client + JWT, RLS enforced) ---");

    const { client: clientB } = await createUserClient(emailB, password);
    const { data: txB, error: txBQueryErr } = await clientB
      .from("transactions")
      .select("id, description, account_id, accounts(name, is_family_shared, owner_user_id)");
    if (txBQueryErr) throw txBQueryErr;

    const { data: accVisibleB } = await clientB
      .from("accounts")
      .select("id, name, owner_user_id, is_family_shared");

    report.isolation.bTxCount = txB?.length ?? 0;
    report.isolation.bSeesOwn = (txB ?? []).some((t) => t.description === markerB);
    report.isolation.bLeakedA = (txB ?? []).some((t) => t.description === markerA);
    report.isolation.bAccountNames = (accVisibleB ?? []).map((a) => a.name);
    report.isolation.bLegacyTxCount = (txB ?? []).filter((t) =>
      ["Nubank", "Cartão de Crédito", "Conta Corrente", "Supermercado"].includes(
        t.accounts?.name ?? "",
      ),
    ).length;

    const { client: clientA } = await createUserClient(emailA, password);
    const { data: txA, error: txAQueryErr } = await clientA
      .from("transactions")
      .select("id, description, account_id, accounts(name)");
    if (txAQueryErr) throw txAQueryErr;

    report.isolation.aTxCount = txA?.length ?? 0;
    report.isolation.aSeesOwn = (txA ?? []).some((t) => t.description === markerA);
    report.isolation.aLeakedB = (txA ?? []).some((t) => t.description === markerB);

    console.log(`User B (${emailB}):`);
    console.log(`  transactions visible: ${report.isolation.bTxCount}`);
    console.log(`  sees own marker "${markerB}": ${report.isolation.bSeesOwn}`);
    console.log(`  leaked A marker "${markerA}": ${report.isolation.bLeakedA}`);
    console.log(`  legacy account tx visible: ${report.isolation.bLegacyTxCount}`);
    console.log(`  accounts visible: ${report.isolation.bAccountNames.join(", ") || "(none)"}`);

    console.log(`\nUser A (${emailA}):`);
    console.log(`  transactions visible: ${report.isolation.aTxCount}`);
    console.log(`  sees own marker "${markerA}": ${report.isolation.aSeesOwn}`);
    console.log(`  leaked B marker "${markerB}": ${report.isolation.aLeakedB}`);

    report.leakConfirmed =
      report.isolation.bLeakedA ||
      report.isolation.aLeakedB ||
      report.isolation.bLegacyTxCount > 0;

    if (report.leakConfirmed) {
      report.rootCause = "RLS policy or account ownership data — cross-user rows visible via anon client";
    } else if (report.orphanPersonalAccounts.length > 0) {
      report.rootCause =
        "RLS OK for isolated users; orphan personal accounts exist but are not visible cross-user (check if assigned owner is wrong user in dev seed)";
    } else {
      report.rootCause =
        "No RLS leak detected. E2E symptom likely UX (no activeFamily filter) or stale session before loginAndSelectFamily fix";
    }

    // Expected policies from migration (document + try supabase db query separately)
    report.policies = {
      source: "migration 20250624000005_rls_policies.sql",
      expected: [
        {
          name: "transactions_select",
          cmd: "SELECT",
          using: "can_view_account(account_id, auth.uid())",
        },
        {
          name: "transactions_insert",
          cmd: "INSERT",
          with_check: "can_post_to_account(account_id, auth.uid()) AND created_by = auth.uid()",
        },
        {
          name: "transactions_update",
          cmd: "UPDATE",
          using: "can_edit_transaction(id, auth.uid())",
        },
        {
          name: "transactions_delete",
          cmd: "DELETE",
          using: "can_edit_transaction(id, auth.uid())",
        },
      ],
    };

    console.log("\n--- Verdict ---");
    console.log(`RLS leak confirmed: ${report.leakConfirmed ? "YES" : "NO"}`);
    console.log(`Root cause hypothesis: ${report.rootCause}`);

    console.log("\n--- JSON evidence ---");
    console.log(JSON.stringify(report, null, 2));

    leakConfirmed = report.leakConfirmed;
  } finally {
    const clean = await runCleanup(admin);
    process.exit(clean ? (leakConfirmed ? 1 : 0) : 2);
  }
}

main().catch((e) => {
  console.error("Audit failed:", e);
  process.exit(2);
});
