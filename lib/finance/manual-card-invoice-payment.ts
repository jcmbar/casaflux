/**
 * Helpers for marking a manual card income as an invoice payment
 * (without creating a bank debit twin).
 */

export type ManualCardInvoicePaymentFormFields = {
  isInvoicePayment: boolean;
  /** Selected fatura due date (YYYY-MM-DD). */
  invoiceDueDate: string;
  /** Closing-date cycle id when known (YYYY-MM-DD). */
  invoiceCycleId: string;
};

export type ManualCardInvoicePaymentPersistFields = {
  invoicePaymentOrigin: "manual" | null;
  statementDueDate: string | null;
  statementCycleId: string | null;
};

export const EMPTY_MANUAL_CARD_INVOICE_PAYMENT_FORM_FIELDS: ManualCardInvoicePaymentFormFields =
  {
    isInvoicePayment: false,
    invoiceDueDate: "",
    invoiceCycleId: "",
  };

/**
 * Maps form checkbox + fatura selection into DB columns for a card income.
 * When unchecked, clears all invoice-payment linkage fields.
 */
export function resolveManualCardInvoicePaymentPersistFields(
  input: ManualCardInvoicePaymentFormFields,
): ManualCardInvoicePaymentPersistFields {
  if (!input.isInvoicePayment) {
    return {
      invoicePaymentOrigin: null,
      statementDueDate: null,
      statementCycleId: null,
    };
  }

  const due = input.invoiceDueDate.trim().slice(0, 10);
  const cycle = input.invoiceCycleId.trim().slice(0, 10);

  return {
    invoicePaymentOrigin: "manual",
    statementDueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
    statementCycleId: /^\d{4}-\d{2}-\d{2}$/.test(cycle) ? cycle : null,
  };
}

export function getManualCardInvoicePaymentValidationError(
  input: ManualCardInvoicePaymentFormFields,
): string | null {
  if (!input.isInvoicePayment) {
    return null;
  }

  const due = input.invoiceDueDate.trim().slice(0, 10);
  const cycle = input.invoiceCycleId.trim().slice(0, 10);
  const hasDue = /^\d{4}-\d{2}-\d{2}$/.test(due);
  const hasCycle = /^\d{4}-\d{2}-\d{2}$/.test(cycle);

  if (!hasDue && !hasCycle) {
    return "Selecione a fatura que este crédito paga.";
  }

  return null;
}

export function inferManualCardInvoicePaymentFormFields(input: {
  type: string;
  invoicePaymentOrigin?: "manual" | "imported" | null;
  statementDueDate?: string | null;
  statementCycleId?: string | null;
}): ManualCardInvoicePaymentFormFields {
  if (input.type !== "income") {
    return { ...EMPTY_MANUAL_CARD_INVOICE_PAYMENT_FORM_FIELDS };
  }

  const hasLink =
    input.invoicePaymentOrigin === "manual" ||
    input.invoicePaymentOrigin === "imported" ||
    Boolean(input.statementDueDate) ||
    Boolean(input.statementCycleId);

  if (!hasLink) {
    return { ...EMPTY_MANUAL_CARD_INVOICE_PAYMENT_FORM_FIELDS };
  }

  return {
    isInvoicePayment: true,
    invoiceDueDate: input.statementDueDate?.slice(0, 10) ?? "",
    invoiceCycleId: input.statementCycleId?.slice(0, 10) ?? "",
  };
}
