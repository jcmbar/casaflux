import { ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import { notifyTransactionsChanged } from "@/lib/finance/create-transaction";
import { canPostToAccount, type Account, type AccountType } from "@/types/account";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Allow-by-default transfer eligibility.
 * Only explicit exceptions are blocked — credit cards stay out because invoice
 * payment is a separate flow.
 */
export const TRANSFER_BLOCKED_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set([
  "credit_card",
]);

export const TRANSFER_NEED_ACCOUNTS_MESSAGE =
  "Cadastre ao menos duas contas (exceto cartão de crédito) para transferir.";

export const TRANSFER_FLOW_HINT =
  "Cria os dois lados vinculados e atualiza os saldos. Cartões de crédito não entram neste fluxo.";

export type CreateAccountTransferInput = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  transactionDate: string;
  description?: string | null;
};

export type CreateAccountTransferResult =
  | {
      ok: true;
      outTransactionId: string;
      inTransactionId: string;
      amount: number;
      fromAccountId: string;
      toAccountId: string;
    }
  | { ok: false; message: string };

export type DeleteAccountTransferResult =
  | {
      ok: true;
      deletedOutTransactionId: string;
      deletedInTransactionId: string;
      amount: number;
    }
  | { ok: false; message: string };

export function isTransferEligibleAccount(
  account: Pick<Account, "type"> | null | undefined,
): boolean {
  return Boolean(
    account && !TRANSFER_BLOCKED_ACCOUNT_TYPES.has(account.type),
  );
}

export function filterTransferEligibleAccounts<T extends Pick<Account, "type">>(
  accounts: T[],
): T[] {
  return accounts.filter(isTransferEligibleAccount);
}

/**
 * Same eligibility used by /lancamentos and quick-add:
 * postable for the user + not in the transfer blocklist.
 */
export function getTransferEligiblePostableAccounts<
  T extends Pick<
    Account,
    "type" | "is_family_shared" | "allow_family_post" | "owner_user_id"
  >,
>(accounts: T[], userId: string): T[] {
  return filterTransferEligibleAccounts(
    accounts.filter((account) => canPostToAccount(account, userId)),
  );
}

export function formatTransferAccountLabel(
  account: Pick<Account, "name" | "type" | "is_family_shared">,
  options?: { includeScope?: boolean },
): string {
  const typeLabel = ACCOUNT_TYPE_LABELS[account.type] ?? account.type;
  const scopeSuffix =
    options?.includeScope === false
      ? ""
      : account.is_family_shared
        ? " · familiar"
        : " · pessoal";

  return `${account.name} · ${typeLabel}${scopeSuffix}`;
}

export function getCreateAccountTransferValidationError(
  input: CreateAccountTransferInput,
): string | null {
  if (!input.fromAccountId || !input.toAccountId) {
    return "Selecione a conta de origem e a de destino.";
  }

  if (input.fromAccountId === input.toAccountId) {
    return "A conta de origem e a de destino devem ser diferentes.";
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return "Informe um valor válido para a transferência.";
  }

  if (!input.transactionDate) {
    return "Informe a data da transferência.";
  }

  return null;
}

export function buildTransferDescriptions(input: {
  fromAccountName: string;
  toAccountName: string;
  description?: string | null;
}): { outDescription: string; inDescription: string } {
  const base = input.description?.trim() || null;

  return {
    outDescription: base
      ? `Transferência para ${input.toAccountName} — ${base}`
      : `Transferência para ${input.toAccountName}`,
    inDescription: base
      ? `Transferência de ${input.fromAccountName} — ${base}`
      : `Transferência de ${input.fromAccountName}`,
  };
}

export function isTransferOutDescription(description: string): boolean {
  return description.startsWith("Transferência para ");
}

export function isTransferInDescription(description: string): boolean {
  return description.startsWith("Transferência de ");
}

export function isLinkedAccountTransfer(
  transaction: Pick<{ type: string; linkedTransactionId?: string | null }, "type"> & {
    linkedTransactionId?: string | null;
  },
): boolean {
  return (
    transaction.type === "transfer" && Boolean(transaction.linkedTransactionId)
  );
}

function mapRpcErrorMessage(message: string | undefined): string {
  const raw = (message ?? "").toLowerCase();

  if (raw.includes("origin and destination must be different")) {
    return "A conta de origem e a de destino devem ser diferentes.";
  }
  if (raw.includes("invalid transfer amount")) {
    return "Informe um valor válido para a transferência.";
  }
  if (
    raw.includes("credit card") ||
    raw.includes("credit_card") ||
    raw.includes("only allowed between")
  ) {
    return "Transferências não incluem cartão de crédito. Use o fluxo de pagamento de fatura.";
  }
  if (raw.includes("not allowed to post")) {
    return "Você não tem permissão para lançar em uma das contas.";
  }
  if (raw.includes("not allowed to delete")) {
    return "Você não tem permissão para excluir esta transferência.";
  }
  if (raw.includes("not a linked account transfer")) {
    return "Este lançamento não é uma transferência vinculada.";
  }
  if (raw.includes("linked transfer leg not found")) {
    return "O outro lado da transferência não foi encontrado.";
  }

  return "Não foi possível concluir a transferência.";
}

export async function createAccountTransfer(
  supabase: SupabaseClient,
  input: CreateAccountTransferInput,
): Promise<CreateAccountTransferResult> {
  const validationError = getCreateAccountTransferValidationError(input);
  if (validationError) {
    return { ok: false, message: validationError };
  }

  const { data, error } = await supabase.rpc("create_account_transfer", {
    p_from_account_id: input.fromAccountId,
    p_to_account_id: input.toAccountId,
    p_amount: input.amount,
    p_transaction_date: input.transactionDate,
    p_description: input.description?.trim() || null,
  });

  if (error) {
    console.error(error);
    return { ok: false, message: mapRpcErrorMessage(error.message) };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  const outTransactionId = String(row.outTransactionId ?? "");
  const inTransactionId = String(row.inTransactionId ?? "");

  if (!outTransactionId || !inTransactionId) {
    return { ok: false, message: "Resposta inválida ao criar a transferência." };
  }

  notifyTransactionsChanged();

  return {
    ok: true,
    outTransactionId,
    inTransactionId,
    amount: Number(row.amount ?? input.amount),
    fromAccountId: String(row.fromAccountId ?? input.fromAccountId),
    toAccountId: String(row.toAccountId ?? input.toAccountId),
  };
}

export async function deleteAccountTransfer(
  supabase: SupabaseClient,
  transactionId: string,
): Promise<DeleteAccountTransferResult> {
  if (!transactionId) {
    return { ok: false, message: "Lançamento inválido." };
  }

  const { data, error } = await supabase.rpc("delete_account_transfer", {
    p_transaction_id: transactionId,
  });

  if (error) {
    console.error(error);
    return { ok: false, message: mapRpcErrorMessage(error.message) };
  }

  const row = (data ?? {}) as Record<string, unknown>;

  notifyTransactionsChanged();

  return {
    ok: true,
    deletedOutTransactionId: String(row.deletedOutTransactionId ?? ""),
    deletedInTransactionId: String(row.deletedInTransactionId ?? ""),
    amount: Number(row.amount ?? 0),
  };
}
