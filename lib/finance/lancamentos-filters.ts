import type { Account, AccountType } from "@/types/account";
import type { Transaction } from "@/types/transaction";

export const ALL_ACCOUNTS_FILTER = "all" as const;

export type LancamentosAccountFilter =
  | typeof ALL_ACCOUNTS_FILTER
  | (string & {});

export type AccountKindLabel = "Conta" | "Cartão";

const BANK_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set([
  "checking",
  "savings",
  "cash",
  "investment",
]);

export function isCreditCardAccount(
  account: Pick<Account, "type"> | null | undefined,
): boolean {
  return account?.type === "credit_card";
}

export function isBankAccount(
  account: Pick<Account, "type"> | null | undefined,
): boolean {
  return Boolean(account && BANK_ACCOUNT_TYPES.has(account.type));
}

export function getAccountKindLabel(
  account: Pick<Account, "type"> | null | undefined,
): AccountKindLabel {
  return isCreditCardAccount(account) ? "Cartão" : "Conta";
}

export function partitionAccountsForFilter<T extends Pick<Account, "type">>(
  accounts: T[],
): { bankAccounts: T[]; creditCards: T[] } {
  const bankAccounts: T[] = [];
  const creditCards: T[] = [];

  for (const account of accounts) {
    if (isCreditCardAccount(account)) {
      creditCards.push(account);
    } else {
      bankAccounts.push(account);
    }
  }

  return { bankAccounts, creditCards };
}

export function filterTransactionsByAccount<
  T extends Pick<Transaction, "accountId">,
>(transactions: T[], accountFilter: LancamentosAccountFilter): T[] {
  if (accountFilter === ALL_ACCOUNTS_FILTER) {
    return transactions;
  }

  return transactions.filter(
    (transaction) => transaction.accountId === accountFilter,
  );
}

export function resolveAccountFilter(
  value: string | null | undefined,
  accountIds: ReadonlySet<string>,
): LancamentosAccountFilter {
  if (!value || value === ALL_ACCOUNTS_FILTER) {
    return ALL_ACCOUNTS_FILTER;
  }

  return accountIds.has(value) ? value : ALL_ACCOUNTS_FILTER;
}

/** Checking-side twin created on Nubank invoice payment commit. */
export const INVOICE_PAYMENT_SOURCE_PREFIX = "Pagamento fatura (origem)";

/** Typical credit-card title for invoice payment in Nubank CSV. */
export const INVOICE_PAYMENT_CARD_DESCRIPTION = "Pagamento recebido";

export type InvoicePaymentSignal =
  | "invoice_payment_source"
  | "invoice_payment_card"
  | null;

export function detectInvoicePaymentSignal(input: {
  description: string;
  accountType?: AccountType | null;
}): InvoicePaymentSignal {
  const description = input.description.trim();

  if (description.startsWith(INVOICE_PAYMENT_SOURCE_PREFIX)) {
    return "invoice_payment_source";
  }

  if (
    description === INVOICE_PAYMENT_CARD_DESCRIPTION &&
    input.accountType === "credit_card"
  ) {
    return "invoice_payment_card";
  }

  return null;
}

export function getInvoicePaymentLabel(
  signal: InvoicePaymentSignal,
): string | null {
  switch (signal) {
    case "invoice_payment_source":
      return "Pagamento de fatura (origem)";
    case "invoice_payment_card":
      return "Pagamento de fatura";
    default:
      return null;
  }
}
