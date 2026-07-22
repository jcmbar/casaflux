/**
 * Idempotent backfill of trusted issuer totals onto imported/manual
 * card_statement_cycles rows that still have amount_due = null (e.g. after
 * migration 20250624000042).
 *
 * Prefer extending the VALUES list in:
 *   supabase/migrations/20250624000044_backfill_imported_statement_amount_due.sql
 * so every environment stays in sync. Use this script for ad-hoc / local
 * application of the same patches (or extra patches not yet migrated).
 *
 * Usage:
 *   npx tsx scripts/backfill-imported-statement-amount-due.ts
 *   npx tsx scripts/backfill-imported-statement-amount-due.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

type IssuerTotalPatch = {
  accountId: string;
  closingDate: string;
  dueDate: string;
  amountDue: number;
  label: string;
};

/**
 * Known file/issuer totals. Keep in sync with migration 000044 when possible.
 * Do not add payment-sized amounts for paid bills that should keep the
 * linked-payment A pagar fallback.
 */
const KNOWN_ISSUER_TOTALS: IssuerTotalPatch[] = [
  {
    accountId: "ceebe7ee-27ec-449f-a986-d92a16fc2bb9",
    closingDate: "2026-05-25",
    dueDate: "2026-06-01",
    amountDue: 4654.46,
    label: "Nubank 26/04–25/05 (due 01/06/2026)",
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const sb = createClient(url, key);
  let updated = 0;
  let skipped = 0;

  for (const patch of KNOWN_ISSUER_TOTALS) {
    const { data: row, error } = await sb
      .from("card_statement_cycles")
      .select("id, amount_due, source, closing_date, due_date")
      .eq("account_id", patch.accountId)
      .eq("closing_date", patch.closingDate)
      .eq("due_date", patch.dueDate)
      .maybeSingle();

    if (error) {
      throw new Error(`${patch.label}: ${error.message}`);
    }
    if (!row) {
      console.log(`MISS  ${patch.label} — no matching cycle`);
      skipped += 1;
      continue;
    }
    if (row.amount_due != null) {
      console.log(
        `SKIP  ${patch.label} — amount_due already ${row.amount_due} (${row.id})`,
      );
      skipped += 1;
      continue;
    }
    if (row.source !== "imported" && row.source !== "manual") {
      console.log(`SKIP  ${patch.label} — source=${row.source}`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(
        `DRY   ${patch.label} — would set amount_due=${patch.amountDue} on ${row.id}`,
      );
      updated += 1;
      continue;
    }

    const { error: updateError } = await sb
      .from("card_statement_cycles")
      .update({
        amount_due: patch.amountDue,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .is("amount_due", null);

    if (updateError) {
      throw new Error(`${patch.label}: ${updateError.message}`);
    }

    console.log(
      `OK    ${patch.label} — ${row.id} amount_due=${patch.amountDue}`,
    );
    updated += 1;
  }

  console.log(`Done. updated=${updated} skipped=${skipped} dryRun=${dryRun}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
