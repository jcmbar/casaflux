import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getTransferEligiblePostableAccounts,
  isTransferEligibleAccount,
} from "@/lib/finance/account-transfer";
import {
  buildStatementCycle,
  getCreditCardBillingConfig,
  getStatementCyclePaidByPaymentDate,
  type StatementCycle,
} from "@/lib/finance/credit-card-billing";
import { notifyTransactionsChanged } from "@/lib/finance/create-transaction";
import {
  canPostToAccount,
  isRealAccount,
  type Account,
} from "@/types/account";

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
  familyId?: string | null;
  /**
   * Target statement cycle (closing-date ISO). Prefer the fatura shown in UI.
   * Falls back to date-based resolution when omitted.
   */
  statementCycleId?: string | null;
  notes?: string | null;
  origin?: InvoicePaymentOrigin;
  /** Optional: validate eligibility against the selected account row. */
  sourceAccount?: Pick<
    Account,
    | "id"
    | "type"
    | "account_mode"
    | "is_family_shared"
    | "allow_family_post"
    | "owner_user_id"
  > | null;
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
 * Same eligibility used by transfers, restricted to real accounts (not forecast).
 */
export function isInvoicePaymentSourceEligibleAccount(
  account: Pick<
    Account,
    | "type"
    | "account_mode"
    | "is_family_shared"
    | "allow_family_post"
    | "owner_user_id"
  > | null | undefined,
  userId: string,
): boolean {
  if (!account) return false;
  if (!isRealAccount(account)) return false;
  if (!isTransferEligibleAccount(account)) return false;
  return canPostToAccount(account, userId);
}

export function getInvoicePaymentSourceAccounts<
  T extends Pick<
    Account,
    | "type"
    | "account_mode"
    | "is_family_shared"
    | "allow_family_post"
    | "owner_user_id"
  >,
>(accounts: T[], userId: string): T[] {
  return getTransferEligiblePostableAccounts(accounts, userId).filter(
    isRealAccount,
  );
}

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
  sourceAccount?: Pick<
    Account,
    | "id"
    | "type"
    | "account_mode"
    | "is_family_shared"
    | "allow_family_post"
    | "owner_user_id"
  > | null;
  userId?: string;
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

  if (input.sourceAccount && input.userId) {
    if (input.sourceAccount.id !== input.sourceAccountId) {
      return "A conta de origem selecionada é inválida.";
    }
    if (!isInvoicePaymentSourceEligibleAccount(input.sourceAccount, input.userId)) {
      return "Esta conta não pode ser usada como origem do pagamento.";
    }
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

function mapInvoicePaymentRpcError(message: string | undefined): string {
  const raw = (message ?? "").toLowerCase();

  if (raw.includes("source account must differ")) {
    return "A conta de origem deve ser diferente do cartão.";
  }
  if (raw.includes("invalid invoice payment amount")) {
    return "Informe um valor válido para o pagamento.";
  }
  if (raw.includes("payment date is required")) {
    return "Informe a data do pagamento.";
  }
  if (raw.includes("source account cannot be a credit card")) {
    return "Cartão de crédito não pode ser a conta de origem. Escolha uma conta corrente, dinheiro ou similar.";
  }
  if (raw.includes("destination must be a credit card")) {
    return "O pagamento precisa ser vinculado a um cartão de crédito.";
  }
  if (raw.includes("not allowed to post to origin")) {
    return "Você não tem permissão para registrar a saída nesta conta de origem.";
  }
  if (raw.includes("not allowed to post to card")) {
    return "Você não tem permissão para registrar o pagamento neste cartão.";
  }
  if (raw.includes("source account not found")) {
    return "Conta de origem não encontrada. Atualize a página e tente de novo.";
  }
  if (raw.includes("card account not found")) {
    return "Cartão não encontrado. Atualize a página e tente de novo.";
  }
  if (raw.includes("not authenticated")) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  if (
    raw.includes("invoice_payment_origin") ||
    raw.includes("statement_cycle_id") ||
    raw.includes("schema cache")
  ) {
    return "O banco ainda não está pronto para pagamentos de fatura. Aplique as migrations mais recentes.";
  }

  return "Não foi possível registrar o pagamento da fatura.";
}

/**
 * Registers an invoice payment via atomic RPC: expense on the source account +
 * income on the card, both linked to the statement cycle.
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
    sourceAccount: input.sourceAccount,
    userId: input.userId,
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

  const { data, error } = await supabase.rpc(
    "create_credit_card_invoice_payment",
    {
      p_card_account_id: input.cardAccount.id,
      p_source_account_id: input.sourceAccountId,
      p_amount: input.amount,
      p_payment_date: input.paymentDate,
      p_statement_cycle_id: statementCycleId,
      p_notes: notes,
      p_origin: origin,
    },
  );

  if (error) {
    console.error(error);
    return { ok: false, message: mapInvoicePaymentRpcError(error.message) };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  const sourceTransactionId = String(row.sourceTransactionId ?? "");
  const cardTransactionId = String(row.cardTransactionId ?? "");

  if (!sourceTransactionId || !cardTransactionId) {
    return {
      ok: false,
      message: "Resposta inválida ao registrar o pagamento da fatura.",
    };
  }

  notifyTransactionsChanged();

  return {
    ok: true,
    statementCycleId:
      typeof row.statementCycleId === "string" && row.statementCycleId
        ? row.statementCycleId
        : statementCycleId,
    sourceTransactionId,
    cardTransactionId,
    origin,
  };
}
