import {
  filterTransferEligibleAccounts,
  getCreateAccountTransferValidationError,
  getTransferEligiblePostableAccounts,
  type CreateAccountTransferInput,
} from "@/lib/finance/account-transfer";
import { centsToAmount } from "@/lib/finance/currency-input";
import type { Account } from "@/types/account";
import type { TransactionType } from "@/types/transaction";

export const QUICK_ADD_TYPE_OPTIONS: Array<{
  value: TransactionType;
  label: string;
}> = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Transferência" },
];

export function isQuickAddTransferType(type: TransactionType): boolean {
  return type === "transfer";
}

export type QuickAddTransferAccountsUiState = {
  showFromPicker: boolean;
  showToPicker: boolean;
  showNeedMoreAccountsMessage: boolean;
  canSubmitWithAccounts: boolean;
};

/**
 * Mirrors /lancamentos: pickers stay visible when there is at least one eligible
 * account. The blocking message appears when a full transfer is still impossible.
 */
export function getQuickAddTransferAccountsUiState(
  eligibleCount: number,
): QuickAddTransferAccountsUiState {
  return {
    showFromPicker: eligibleCount >= 1,
    showToPicker: eligibleCount >= 1,
    showNeedMoreAccountsMessage: eligibleCount < 2,
    canSubmitWithAccounts: eligibleCount >= 2,
  };
}

export function resolveQuickAddTransferAccounts(input: {
  accounts: Array<Pick<Account, "id" | "type">>;
  fromAccountId: string;
  toAccountId: string;
}): { fromAccountId: string; toAccountId: string } {
  const eligible = filterTransferEligibleAccounts(input.accounts);
  const fromAccountId = eligible.some((account) => account.id === input.fromAccountId)
    ? input.fromAccountId
    : (eligible[0]?.id ?? "");

  const toAccountId = eligible.some(
    (account) =>
      account.id === input.toAccountId && account.id !== fromAccountId,
  )
    ? input.toAccountId
    : (eligible.find((account) => account.id !== fromAccountId)?.id ?? "");

  return { fromAccountId, toAccountId };
}

export function listQuickAddTransferAccounts<
  T extends Pick<
    Account,
    "id" | "type" | "is_family_shared" | "allow_family_post" | "owner_user_id"
  >,
>(accounts: T[], userId: string): T[] {
  return getTransferEligiblePostableAccounts(accounts, userId);
}

export function buildQuickAddTransferInput(input: {
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  transactionDate: string;
  description: string;
}): CreateAccountTransferInput | { error: string } {
  const amount = centsToAmount(input.amountCents);
  const payload: CreateAccountTransferInput = {
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount,
    transactionDate: input.transactionDate,
    description: input.description.trim() || null,
  };

  const validationError = getCreateAccountTransferValidationError(payload);
  if (validationError) {
    return { error: validationError };
  }

  return payload;
}
