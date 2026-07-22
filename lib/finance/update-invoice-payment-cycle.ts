import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getCreditCardBillingConfig,
  type CreditCardBillingConfig,
} from "@/lib/finance/credit-card-billing";
import { notifyTransactionsChanged } from "@/lib/finance/create-transaction";
import {
  detectInvoicePaymentSignal,
  INVOICE_PAYMENT_CARD_DESCRIPTION,
  INVOICE_PAYMENT_SOURCE_PREFIX,
} from "@/lib/finance/lancamentos-filters";
import {
  resolveInvoicePaymentCycleTarget,
  type InvoicePaymentCycleResolveContext,
  type InvoicePaymentCycleTargetSelection,
} from "@/lib/integrations/invoice-payment/invoice-payment-cycle-target";
import type { Account } from "@/types/account";

export type InvoicePaymentCycleLegRow = {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  account_id: string;
  transaction_date: string;
  statement_cycle_id: string | null;
  statement_due_date: string | null;
  invoice_payment_origin: "manual" | "imported" | null;
  linked_transaction_id: string | null;
  reconciled_with_transaction_id: string | null;
};

export type UpdateInvoicePaymentCycleInput = {
  transactionId: string;
  selection: InvoicePaymentCycleTargetSelection;
  /** Required to resolve previous/current/future from the payment date. */
  billingConfig: CreditCardBillingConfig;
  /** Imported cycles / file cycle for due-date resolution. */
  context?: InvoicePaymentCycleResolveContext | null;
  /**
   * Optional accounts used only to validate that a credit-card leg exists.
   * Twin resolution does not require this list.
   */
  accounts?: Pick<Account, "id" | "type">[];
};

export type UpdateInvoicePaymentCycleResult =
  | {
      ok: true;
      statementCycleId: string;
      statementDueDate: string;
      updatedIds: string[];
    }
  | { ok: false; message: string };

const LEG_SELECT =
  "id, description, amount, type, account_id, transaction_date, statement_cycle_id, statement_due_date, invoice_payment_origin, linked_transaction_id, reconciled_with_transaction_id";

export function isInvoicePaymentCycleEditableRow(
  row: Pick<
    InvoicePaymentCycleLegRow,
    "description" | "invoice_payment_origin" | "type"
  >,
  accountType?: Account["type"] | null,
): boolean {
  if (
    row.invoice_payment_origin === "manual" ||
    row.invoice_payment_origin === "imported"
  ) {
    return true;
  }

  return Boolean(
    detectInvoicePaymentSignal({
      description: row.description,
      accountType,
    }),
  );
}

export async function resolveInvoicePaymentTwinIds(
  supabase: SupabaseClient,
  transactionId: string,
): Promise<{
  ids: string[];
  primary: InvoicePaymentCycleLegRow | null;
  twin: InvoicePaymentCycleLegRow | null;
  errorMessage: string | null;
}> {
  const { data: primaryData, error: primaryError } = await supabase
    .from("transactions")
    .select(LEG_SELECT)
    .eq("id", transactionId)
    .maybeSingle();

  if (primaryError) {
    return {
      ids: [],
      primary: null,
      twin: null,
      errorMessage: primaryError.message,
    };
  }

  const primary = (primaryData ?? null) as InvoicePaymentCycleLegRow | null;
  if (!primary) {
    return {
      ids: [],
      primary: null,
      twin: null,
      errorMessage: "Lançamento não encontrado.",
    };
  }

  let twinId = primary.linked_transaction_id;

  if (!twinId) {
    const { data: batchRow, error: batchError } = await supabase
      .from("import_batch_rows")
      .select("transaction_id, linked_transaction_id")
      .or(
        `transaction_id.eq.${transactionId},linked_transaction_id.eq.${transactionId}`,
      )
      .limit(1)
      .maybeSingle();

    if (batchError) {
      return {
        ids: [primary.id],
        primary,
        twin: null,
        errorMessage: batchError.message,
      };
    }

    if (batchRow) {
      const batchTransactionId = batchRow.transaction_id as string | null;
      const batchLinkedId = batchRow.linked_transaction_id as string | null;
      twinId =
        batchTransactionId === transactionId
          ? batchLinkedId
          : batchTransactionId;
    }
  }

  if (!twinId || twinId === primary.id) {
    return {
      ids: [primary.id],
      primary,
      twin: null,
      errorMessage: null,
    };
  }

  const { data: twinData, error: twinError } = await supabase
    .from("transactions")
    .select(LEG_SELECT)
    .eq("id", twinId)
    .maybeSingle();

  if (twinError) {
    return {
      ids: [primary.id],
      primary,
      twin: null,
      errorMessage: twinError.message,
    };
  }

  const twin = (twinData ?? null) as InvoicePaymentCycleLegRow | null;
  return {
    ids: twin ? [primary.id, twin.id] : [primary.id],
    primary,
    twin,
    errorMessage: null,
  };
}

/**
 * Updates `statement_due_date` (preferred) and `statement_cycle_id` (legacy)
 * on the payment leg and its twin (source↔card) when resolvable.
 */
export async function updateInvoicePaymentCycle(
  supabase: SupabaseClient,
  input: UpdateInvoicePaymentCycleInput,
): Promise<UpdateInvoicePaymentCycleResult> {
  const resolved = await resolveInvoicePaymentTwinIds(
    supabase,
    input.transactionId,
  );

  if (resolved.errorMessage && !resolved.primary) {
    return { ok: false, message: resolved.errorMessage };
  }

  if (!resolved.primary) {
    return { ok: false, message: "Lançamento não encontrado." };
  }

  const accountType =
    input.accounts?.find(
      (account) => account.id === resolved.primary!.account_id,
    )?.type ?? null;

  if (!isInvoicePaymentCycleEditableRow(resolved.primary, accountType)) {
    return {
      ok: false,
      message: "Este lançamento não é um pagamento de fatura editável.",
    };
  }

  const paymentDate = resolved.primary.transaction_date.slice(0, 10);
  const cycle = resolveInvoicePaymentCycleTarget(
    input.billingConfig,
    paymentDate,
    input.selection,
    input.context,
  );
  const statementCycleId = cycle.cycleId;
  const statementDueDate = cycle.dueDate.slice(0, 10);

  const { error } = await supabase
    .from("transactions")
    .update({
      statement_cycle_id: statementCycleId,
      statement_due_date: statementDueDate,
    })
    .in("id", resolved.ids);

  if (error) {
    return { ok: false, message: error.message };
  }

  // Best-effort: link twins when import left linked_transaction_id empty.
  if (
    resolved.twin &&
    (!resolved.primary.linked_transaction_id ||
      !resolved.twin.linked_transaction_id)
  ) {
    await supabase
      .from("transactions")
      .update({ linked_transaction_id: resolved.twin.id })
      .eq("id", resolved.primary.id);
    await supabase
      .from("transactions")
      .update({ linked_transaction_id: resolved.primary.id })
      .eq("id", resolved.twin.id);
  }

  notifyTransactionsChanged();

  return {
    ok: true,
    statementCycleId,
    statementDueDate,
    updatedIds: resolved.ids,
  };
}

export function resolveInvoicePaymentCardAccountId(input: {
  primary: InvoicePaymentCycleLegRow;
  twin: InvoicePaymentCycleLegRow | null;
  accounts: Pick<Account, "id" | "type">[];
}): string | null {
  for (const leg of [input.primary, input.twin]) {
    if (!leg) continue;
    const account = input.accounts.find((item) => item.id === leg.account_id);
    if (account?.type === "credit_card") {
      return account.id;
    }
  }

  // Heuristic from description when accounts list is incomplete.
  if (
    input.primary.description.trim() === INVOICE_PAYMENT_CARD_DESCRIPTION ||
    input.twin?.description.trim() === INVOICE_PAYMENT_CARD_DESCRIPTION
  ) {
    const cardLeg =
      input.primary.description.trim() === INVOICE_PAYMENT_CARD_DESCRIPTION
        ? input.primary
        : input.twin;
    return cardLeg?.account_id ?? null;
  }

  if (
    input.primary.description.startsWith(INVOICE_PAYMENT_SOURCE_PREFIX) &&
    input.twin
  ) {
    return input.twin.account_id;
  }

  return null;
}

export function getInvoicePaymentBillingConfigForAccounts(
  cardAccountId: string | null,
  accounts: Pick<
    Account,
    "id" | "type" | "statement_closing_day" | "statement_due_day"
  >[],
): CreditCardBillingConfig | null {
  if (!cardAccountId) {
    return null;
  }

  const card = accounts.find((account) => account.id === cardAccountId);
  return card ? getCreditCardBillingConfig(card) : null;
}
