import type { SupabaseClient } from "@supabase/supabase-js";

import {
  adjustAccountBalance,
  getTransactionBalanceDelta,
} from "@/lib/finance/account-balance";
import {
  buildStatementCycle,
  getCreditCardBillingConfig,
  getStatementCyclePaidByPaymentDate,
  type StatementCycle,
} from "@/lib/finance/credit-card-billing";
import { notifyTransactionsChanged } from "@/lib/finance/create-transaction";
import { INVOICE_PAYMENT_CARD_DESCRIPTION } from "@/lib/finance/lancamentos-filters";
import type { Account } from "@/types/account";

export type InvoicePaymentOrigin = "manual" | "imported";

export type CreateInvoicePaymentInput = {
  cardAccount: Pick<
    Account,
    "id" | "type" | "statement_closing_day" | "statement_due_day"
  >;
  sourceAccountId: string;
  amount: number;
  paymentDate: string;
  userId: string;
  familyId: string | null;
  /**
   * Target statement cycle (closing-date ISO). Prefer the fatura shown in UI.
   * Falls back to date-based resolution when omitted.
   */
  statementCycleId?: string | null;
  notes?: string | null;
  origin?: InvoicePaymentOrigin;
};

export type CreateInvoicePaymentResult =
  | {
      ok: true;
      statementCycleId: string | null;
      sourceTransactionId: string;
      cardTransactionId: string;
      origin: InvoicePaymentOrigin;
    }
  | { ok: false; message: string };

export type ResolvedInvoicePaymentTarget = {
  statementCycleId: string;
  cycle: StatementCycle;
};

/**
 * Pure validation for the manual invoice payment form / service.
 */
export function getInvoicePaymentValidationError(input: {
  amount: number;
  sourceAccountId: string;
  cardAccountId: string;
  paymentDate: string;
  statementCycleId?: string | null;
  hasBillingConfig: boolean;
}): string | null {
  if (!(input.amount > 0)) {
    return "Informe um valor válido para o pagamento.";
  }

  if (!input.sourceAccountId) {
    return "Selecione a conta de origem do pagamento.";
  }

  if (input.sourceAccountId === input.cardAccountId) {
    return "A conta de origem deve ser diferente do cartão.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)) {
    return "Informe a data do pagamento.";
  }

  if (!input.hasBillingConfig && !input.statementCycleId) {
    return "Configure fechamento e vencimento do cartão para vincular a fatura.";
  }

  return null;
}

/**
 * Resolves which statement cycle a payment should settle.
 * Explicit `statementCycleId` (from the UI fatura) wins; otherwise derive from date.
 */
export function resolveInvoicePaymentTarget(input: {
  cardAccount: Pick<
    Account,
    "type" | "statement_closing_day" | "statement_due_day"
  >;
  paymentDate: string;
  statementCycleId?: string | null;
}): ResolvedInvoicePaymentTarget | null {
  const config = getCreditCardBillingConfig(input.cardAccount);
  if (!config) {
    return null;
  }

  if (input.statementCycleId) {
    const cycle = buildStatementCycle({
      closingDate: input.statementCycleId.slice(0, 10),
      closingDay: config.statementClosingDay,
      dueDay: config.statementDueDay,
    });
    return {
      statementCycleId: cycle.cycleId,
      cycle,
    };
  }

  const cycle = getStatementCyclePaidByPaymentDate(config, input.paymentDate);
  return {
    statementCycleId: cycle.cycleId,
    cycle,
  };
}

function withOptionalNotes(baseDescription: string, notes: string | null) {
  if (!notes) return baseDescription;
  return `${baseDescription} — ${notes}`;
}

/**
 * Registers an invoice payment: expense on the source account + income on the
 * card, both linked to the statement cycle and tagged with payment origin.
 *
 * `reconciled_with_transaction_id` stays null until a future reconciliation
 * step links this manual payment to an imported equivalent.
 */
export async function createCreditCardInvoicePayment(
  supabase: SupabaseClient,
  input: CreateInvoicePaymentInput,
): Promise<CreateInvoicePaymentResult> {
  const config = getCreditCardBillingConfig(input.cardAccount);
  const validationError = getInvoicePaymentValidationError({
    amount: input.amount,
    sourceAccountId: input.sourceAccountId,
    cardAccountId: input.cardAccount.id,
    paymentDate: input.paymentDate,
    statementCycleId: input.statementCycleId,
    hasBillingConfig: Boolean(config),
  });

  if (validationError) {
    return { ok: false, message: validationError };
  }

  const origin: InvoicePaymentOrigin = input.origin ?? "manual";
  const target = resolveInvoicePaymentTarget({
    cardAccount: input.cardAccount,
    paymentDate: input.paymentDate,
    statementCycleId: input.statementCycleId,
  });
  const statementCycleId = target?.statementCycleId ?? null;
  const notes = input.notes?.trim() ? input.notes.trim() : null;

  const sourceDescription = withOptionalNotes(
    `Pagamento fatura (origem) — ${INVOICE_PAYMENT_CARD_DESCRIPTION}`,
    notes,
  );
  const cardDescription = withOptionalNotes(
    INVOICE_PAYMENT_CARD_DESCRIPTION,
    notes,
  );

  const { data: sourceRow, error: sourceError } = await supabase
    .from("transactions")
    .insert({
      description: sourceDescription,
      amount: input.amount,
      type: "expense",
      category_id: null,
      account_id: input.sourceAccountId,
      transaction_date: input.paymentDate,
      created_by: input.userId,
      family_id: input.familyId,
      statement_cycle_id: statementCycleId,
      invoice_payment_origin: origin,
      reconciled_with_transaction_id: null,
    })
    .select("id")
    .single();

  if (sourceError || !sourceRow) {
    console.error(sourceError);
    return { ok: false, message: "Não foi possível registrar a saída da origem." };
  }

  const { data: cardRow, error: cardError } = await supabase
    .from("transactions")
    .insert({
      description: cardDescription,
      amount: input.amount,
      type: "income",
      category_id: null,
      account_id: input.cardAccount.id,
      transaction_date: input.paymentDate,
      created_by: input.userId,
      family_id: input.familyId,
      statement_cycle_id: statementCycleId,
      invoice_payment_origin: origin,
      reconciled_with_transaction_id: null,
      linked_transaction_id: sourceRow.id,
    })
    .select("id")
    .single();

  if (cardError || !cardRow) {
    console.error(cardError);
    await supabase.from("transactions").delete().eq("id", sourceRow.id);
    return {
      ok: false,
      message: "Não foi possível registrar o pagamento no cartão.",
    };
  }

  await supabase
    .from("transactions")
    .update({ linked_transaction_id: cardRow.id })
    .eq("id", sourceRow.id);

  try {
    await adjustAccountBalance(supabase, {
      accountId: input.sourceAccountId,
      delta: getTransactionBalanceDelta("expense", input.amount),
    });
    await adjustAccountBalance(supabase, {
      accountId: input.cardAccount.id,
      delta: getTransactionBalanceDelta("income", input.amount),
    });
  } catch (balanceError) {
    console.error(balanceError);
  }

  notifyTransactionsChanged();

  return {
    ok: true,
    statementCycleId,
    sourceTransactionId: sourceRow.id,
    cardTransactionId: cardRow.id,
    origin,
  };
}
