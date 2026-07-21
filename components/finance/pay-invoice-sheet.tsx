"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/forms/currency-input";
import {
  FormField,
  FormInput,
  FormSelect,
} from "@/components/forms/form-controls";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatFullBrDate,
  formatStatementPeriodLabel,
  type StatementCycle,
} from "@/lib/finance/credit-card-billing";
import {
  createCreditCardInvoicePayment,
  getInvoicePaymentValidationError,
} from "@/lib/finance/create-invoice-payment";
import {
  centsToAmount,
  isPositiveCents,
} from "@/lib/finance/currency-input";
import { formatAccountSelectLabel } from "@/lib/finance/account-identity";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import type { Account } from "@/types/account";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function amountToCents(amount: number) {
  return Math.round(Math.max(0, amount) * 100);
}

export function PayInvoiceSheet({
  open,
  onOpenChange,
  cardAccount,
  cycle,
  remainingAmount,
  sourceAccounts,
  userId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardAccount: Account;
  cycle: StatementCycle;
  remainingAmount: number;
  sourceAccounts: Account[];
  userId: string;
  onSuccess?: () => void | Promise<void>;
}) {
  const supabase = useMemo(() => createClient()!, []);
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [amountCents, setAmountCents] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedSourceAccount = useMemo(
    () =>
      sourceAccounts.find((account) => account.id === sourceAccountId) ?? null,
    [sourceAccountId, sourceAccounts],
  );

  useEffect(() => {
    if (!open) return;

    setPaymentDate(todayIsoDate());
    setAmountCents(amountToCents(remainingAmount));
    setNotes("");
    setSourceAccountId((current) => {
      if (current && sourceAccounts.some((account) => account.id === current)) {
        return current;
      }
      return sourceAccounts[0]?.id ?? "";
    });
  }, [open, remainingAmount, sourceAccounts]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const amount = centsToAmount(amountCents);
    const validationError = getInvoicePaymentValidationError({
      amount,
      sourceAccountId,
      cardAccountId: cardAccount.id,
      paymentDate,
      statementCycleId: cycle.cycleId,
      hasBillingConfig: true,
      sourceAccount: selectedSourceAccount,
      userId,
    });

    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (!isPositiveCents(amountCents)) {
      toast.error("Informe um valor válido para o pagamento.");
      return;
    }

    setSaving(true);

    const result = await createCreditCardInvoicePayment(supabase, {
      cardAccount,
      sourceAccountId,
      sourceAccount: selectedSourceAccount,
      amount,
      paymentDate,
      userId,
      familyId: cardAccount.family_id,
      statementCycleId: cycle.cycleId,
      notes: notes.trim() || null,
      origin: "manual",
    });

    setSaving(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success("Pagamento da fatura registrado.");
    onOpenChange(false);
    await onSuccess?.();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Pagar fatura</SheetTitle>
          <SheetDescription>
            Registra a saída na conta de origem e o pagamento no cartão, já
            vinculados a esta fatura.
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4"
          onSubmit={handleSubmit}
          data-testid="pay-invoice-form"
        >
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-sm">
            <p className="font-medium text-foreground">{cardAccount.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Fatura {formatStatementPeriodLabel(cycle)} · vence{" "}
              {formatFullBrDate(cycle.dueDate)}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Restante:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatCurrency(remainingAmount)}
              </span>
            </p>
          </div>

          <FormSelect
            id="pay-invoice-source"
            label="Conta de origem"
            value={sourceAccountId}
            onChange={(event) => setSourceAccountId(event.target.value)}
            required
            data-testid="pay-invoice-source"
          >
            <option value="" disabled>
              Selecione a conta
            </option>
            {sourceAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {formatAccountSelectLabel(account)}
              </option>
            ))}
          </FormSelect>

          <FormInput
            id="pay-invoice-date"
            label="Data do pagamento"
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            required
            data-testid="pay-invoice-date"
          />

          <FormField id="pay-invoice-amount" label="Valor pago">
            <CurrencyInput
              id="pay-invoice-amount"
              valueCents={amountCents}
              onValueCentsChange={setAmountCents}
              className="flex h-10 w-full rounded-lg border border-input bg-surface-sunken/60 px-2.5 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/40"
              data-testid="pay-invoice-amount"
            />
          </FormField>

          <FormField id="pay-invoice-notes" label="Observação (opcional)">
            <Input
              id="pay-invoice-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ex.: pago pelo app do banco"
              className="h-10 bg-surface-sunken/60 dark:bg-input/40"
              data-testid="pay-invoice-notes"
            />
          </FormField>

          <SheetFooter className="mt-auto gap-2 border-t px-0 pt-4 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || sourceAccounts.length === 0}
              data-testid="pay-invoice-submit"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                "Confirmar pagamento"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
