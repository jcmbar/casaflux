import type {
  ImportReviewStatus,
  ImportSource,
  NormalizedImportKind,
} from "../types";

export const importSourceLabels: Record<ImportSource, string> = {
  nubank_credit_card: "Nubank — Cartão de crédito",
  nubank_checking: "Nubank — Conta corrente",
};

export const importKindLabels: Record<NormalizedImportKind, string> = {
  bank_income: "Entrada bancária",
  bank_expense: "Despesa no débito",
  bank_transfer_out: "Transferência enviada",
  bank_reversal: "Estorno",
  card_purchase: "Compra no cartão",
  card_fee: "Taxa IOF",
  card_invoice_payment: "Pagamento de fatura",
  unknown: "Desconhecido",
};

export const importReviewStatusLabels: Record<ImportReviewStatus, string> = {
  ready: "Pronto",
  needs_account: "Conta pendente",
  possible_duplicate: "Possível duplicata",
  already_imported: "Já importada",
  possible_historical_conflict: "Conflito histórico",
  invalid: "Inválida",
};

export const importHistoricalStatusLabels = {
  new: "Nova",
  already_imported: "Já importada",
  possible_historical_conflict: "Conflito histórico",
} as const;

export const importDirectionLabels = {
  in: "Entrada",
  out: "Saída",
} as const;
