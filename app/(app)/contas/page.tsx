"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";

import { AccountIdentity } from "@/components/finance/account-identity";
import { CreditCardStatementSummary } from "@/components/finance/credit-card-statement-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FormField,
  FormInput,
  FormSection,
  FormSelect,
} from "@/components/forms/form-controls";
import { PageIntro } from "@/components/layout/page-intro";
import { useConfirm } from "@/components/feedback/confirm-dialog-provider";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppContext } from "@/contexts/app-context";
import { getCreditCardBillingValidationError } from "@/lib/finance/credit-card-billing";
import { fetchAllTransactionsForAccounts } from "@/lib/finance/fetch-transactions";
import { resolveContasCardStatementContext } from "@/lib/finance/lancamentos-card-statement";
import { TRANSACTIONS_SELECT } from "@/lib/finance/transactions-query";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import {
  canEditAccount,
  filterForecastAccounts,
  filterRealAccounts,
  type Account,
  type AccountMode,
  type AccountType,
} from "@/types/account";
import { mapTransaction, type Transaction, type TransactionRow } from "@/types/transaction";

type FormState = {
  name: string;
  type: AccountType;
  accountMode: AccountMode;
  balance: string;
  color: string;
  scope: "personal" | "family";
  allowFamilyView: boolean;
  allowFamilyPost: boolean;
  allowFamilyEdit: boolean;
  statementClosingDay: string;
  statementDueDay: string;
};

const defaultForm: FormState = {
  name: "",
  type: "checking",
  accountMode: "real",
  balance: "",
  color: "#0f766e",
  scope: "personal",
  allowFamilyView: true,
  allowFamilyPost: true,
  allowFamilyEdit: false,
  statementClosingDay: "",
  statementDueDay: "",
};

function parseOptionalDay(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function billingFieldsForType(type: AccountType, form: FormState) {
  if (type !== "credit_card") {
    return {
      statement_closing_day: null,
      statement_due_day: null,
    };
  }

  return {
    statement_closing_day: parseOptionalDay(form.statementClosingDay),
    statement_due_day: parseOptionalDay(form.statementDueDay),
  };
}

export default function ContasPage() {
  const supabase = useMemo(() => createClient()!, []);
  const confirm = useConfirm();
  const { user, activeFamily, isFamilyAdmin } = useAppContext();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cardTransactions, setCardTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const statementReferenceDate = useMemo(
    () => new Date().toISOString().slice(0, 10),
    [],
  );

  async function loadAccounts() {
    setLoading(true);

    const { data, error } = await supabase
      .from("accounts")
      .select("*, families (id, name, slug)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      toast.error("Não foi possível carregar as contas.");
      setLoading(false);
      return;
    }

    const loadedAccounts = (data ?? []) as Account[];
    setAccounts(loadedAccounts);

    const cardIds = loadedAccounts
      .filter((account) => account.type === "credit_card")
      .map((account) => account.id);

    if (cardIds.length === 0) {
      setCardTransactions([]);
    } else {
      const transactionsRes = await fetchAllTransactionsForAccounts<TransactionRow>(
        supabase,
        {
          accountIds: cardIds,
          // Same select as `/lancamentos` so settlement fields stay aligned.
          select: TRANSACTIONS_SELECT,
        },
      );

      if (transactionsRes.error) {
        console.error(transactionsRes.error);
        setCardTransactions([]);
      } else {
        setCardTransactions(transactionsRes.data.map(mapTransaction));
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  function resetForm() {
    setEditingId(null);
    setForm(defaultForm);
  }

  function handleOpenNew() {
    resetForm();
    setOpen(true);
  }

  function handleEdit(account: Account) {
    setEditingId(account.id);
    setForm({
      name: account.name,
      type: account.type,
      accountMode: account.account_mode,
      balance: String(account.balance),
      color: account.color ?? "#0f766e",
      scope: account.is_family_shared ? "family" : "personal",
      allowFamilyView: account.allow_family_view,
      allowFamilyPost: account.allow_family_post,
      allowFamilyEdit: account.allow_family_edit,
      statementClosingDay:
        account.statement_closing_day != null
          ? String(account.statement_closing_day)
          : "",
      statementDueDay:
        account.statement_due_day != null
          ? String(account.statement_due_day)
          : "",
    });
    setOpen(true);
  }

  function canManageAccount(account: Account) {
    if (!user) return false;
    return canEditAccount(account, user.id, isFamilyAdmin);
  }

  async function handleDelete(account: Account) {
    if (!canManageAccount(account)) {
      toast.error("Você não tem permissão para excluir esta conta.");
      return;
    }

    const confirmed = await confirm({
      title: "Excluir conta",
      description: `Excluir a conta "${account.name}"?`,
      confirmLabel: "Excluir",
      destructive: true,
    });

    if (!confirmed) return;

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", account.id);

    if (error) {
      console.error(error);
      toast.error("Não foi possível excluir a conta.");
      return;
    }

    await loadAccounts();
    toast.success("Conta excluída.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) return;

    const parsedBalance = Number(form.balance.replace(",", "."));

    if (!form.name.trim()) {
      toast.error("Informe o nome da conta.");
      return;
    }

    if (Number.isNaN(parsedBalance)) {
      toast.error("Informe um saldo válido.");
      return;
    }

    if (form.scope === "family" && !activeFamily) {
      toast.error(
        "Selecione ou crie uma família antes de criar contas compartilhadas.",
      );
      return;
    }

    const billing = billingFieldsForType(form.type, form);
    const billingError = getCreditCardBillingValidationError({
      type: form.type,
      statementClosingDay: billing.statement_closing_day,
      statementDueDay: billing.statement_due_day,
    });
    if (billingError) {
      toast.error(billingError);
      return;
    }

    setSaving(true);

    const payload =
      form.scope === "personal"
        ? {
            name: form.name.trim(),
            type: form.type,
            account_mode: form.accountMode,
            balance: parsedBalance,
            color: form.color || null,
            owner_user_id: user.id,
            family_id: null,
            is_family_shared: false,
            allow_family_view: false,
            allow_family_post: false,
            allow_family_edit: false,
            ...billing,
          }
        : {
            name: form.name.trim(),
            type: form.type,
            account_mode: form.accountMode,
            balance: parsedBalance,
            color: form.color || null,
            owner_user_id: null,
            family_id: activeFamily!.id,
            is_family_shared: true,
            allow_family_view: form.allowFamilyView,
            allow_family_post: form.allowFamilyPost,
            allow_family_edit: form.allowFamilyEdit,
            ...billing,
          };

    if (editingId) {
      const { error } = await supabase
        .from("accounts")
        .update(payload)
        .eq("id", editingId);

      if (error) {
        console.error(error);
        toast.error("Não foi possível atualizar a conta.");
        setSaving(false);
        return;
      }
    } else if (form.scope === "personal") {
      const { error } = await supabase.from("accounts").insert({
        name: form.name.trim(),
        type: form.type,
        account_mode: form.accountMode,
        balance: parsedBalance,
        color: form.color || null,
        owner_user_id: user.id,
        family_id: null,
        is_family_shared: false,
        allow_family_view: false,
        allow_family_post: false,
        allow_family_edit: false,
        ...billing,
      });

      if (error) {
        console.error(error);
        toast.error("Não foi possível criar a conta.");
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("accounts").insert({
        name: form.name.trim(),
        type: form.type,
        account_mode: form.accountMode,
        balance: parsedBalance,
        color: form.color || null,
        owner_user_id: null,
        family_id: activeFamily!.id,
        is_family_shared: true,
        allow_family_view: form.allowFamilyView,
        allow_family_post: form.allowFamilyPost,
        allow_family_edit: form.allowFamilyEdit,
        ...billing,
      });

      if (error) {
        console.error(error);
        toast.error("Não foi possível criar a conta.");
        setSaving(false);
        return;
      }
    }

    await loadAccounts();
    resetForm();
    setOpen(false);
    setSaving(false);
    toast.success(editingId ? "Conta atualizada." : "Conta criada.");
  }

  const realAccounts = filterRealAccounts(accounts);
  const forecastAccounts = filterForecastAccounts(accounts);
  const totalBalance = realAccounts.reduce(
    (acc, account) => acc + Number(account.balance),
    0,
  );
  const forecastBalance = forecastAccounts.reduce(
    (acc, account) => acc + Number(account.balance),
    0,
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageIntro description="Contas do dia a dia e provisões para organizar seus saldos." />

      <div className="flex justify-stretch sm:justify-end">
        <Button onClick={handleOpenNew} className="w-full shadow-sm sm:w-auto">
          <Plus className="h-4 w-4" />
          Nova conta
        </Button>
      </div>

      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetForm();
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {editingId ? "Editar conta" : "Nova conta"}
            </SheetTitle>
            <SheetDescription>
              Defina a finalidade, o formato e quem pode acessar a conta.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="grid flex-1 gap-5 overflow-y-auto px-6 py-5">
              <FormSelect
                id="scope"
                label="Visibilidade"
                value={form.scope}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    scope: event.target.value as FormState["scope"],
                  }))
                }
                disabled={Boolean(editingId)}
              >
                <option value="personal">Pessoal (privada)</option>
                <option value="family" disabled={!activeFamily}>
                  Familiar (compartilhada)
                </option>
              </FormSelect>

              <FormSelect
                id="account-mode"
                label="Finalidade"
                value={form.accountMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    accountMode: event.target.value as AccountMode,
                  }))
                }
              >
                <option value="real">Real — saldo disponível</option>
                <option value="forecast">
                  Provisão — reserva para planejamento
                </option>
              </FormSelect>

              {form.accountMode === "forecast" ? (
                <p className="-mt-3 text-xs text-muted-foreground">
                  Contas de provisão só separam um valor reservado e ficam fora
                  do saldo real. Para registrar uma receita ou despesa futura,
                  use “Nova previsão” em Lançamentos.
                </p>
              ) : null}

              <FormInput
                id="name"
                label="Nome da conta"
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />

              <FormSelect
                id="type"
                label="Formato"
                value={form.type}
                onChange={(event) => {
                  const nextType = event.target.value as AccountType;
                  setForm((current) => ({
                    ...current,
                    type: nextType,
                    ...(nextType === "credit_card"
                      ? {}
                      : {
                          statementClosingDay: "",
                          statementDueDay: "",
                        }),
                  }));
                }}
              >
                <option value="checking">Conta corrente</option>
                <option value="savings">Poupança</option>
                <option value="cash">Dinheiro</option>
                <option value="credit_card">Cartão de crédito</option>
                <option value="investment">Investimento</option>
              </FormSelect>

              {form.type === "credit_card" ? (
                <div className="space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                  <p className="text-sm text-muted-foreground">
                    Opcional — fallback quando ainda não há fatura importada.
                    Na importação do CSV você informa o fechamento e o vencimento
                    reais de cada fatura.
                  </p>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormInput
                      id="statement-closing-day"
                      label="Dia de fechamento (fallback)"
                      type="number"
                      min={1}
                      max={31}
                      placeholder="Ex.: 25"
                      value={form.statementClosingDay}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          statementClosingDay: event.target.value,
                        }))
                      }
                      data-testid="account-statement-closing-day"
                    />
                    <FormInput
                      id="statement-due-day"
                      label="Dia de vencimento (fallback)"
                      type="number"
                      min={1}
                      max={31}
                      placeholder="Ex.: 4"
                      value={form.statementDueDay}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          statementDueDay: event.target.value,
                        }))
                      }
                      data-testid="account-statement-due-day"
                    />
                  </div>
                </div>
              ) : null}

              <div className="grid gap-5 sm:grid-cols-2">
                <FormInput
                  id="balance"
                  label="Saldo inicial"
                  type="number"
                  step="0.01"
                  value={form.balance}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      balance: event.target.value,
                    }))
                  }
                  required
                />

                <FormField id="color" label="Cor">
                  <input
                    id="color"
                    type="color"
                    value={form.color}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        color: event.target.value,
                      }))
                    }
                    className="h-10 w-full cursor-pointer rounded-lg border border-input bg-surface-sunken/60 px-2 py-1 dark:bg-input/40"
                  />
                </FormField>
              </div>

              {form.scope === "family" ? (
                <FormSection title="Permissões da família">
                  <label className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.allowFamilyView}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          allowFamilyView: event.target.checked,
                        }))
                      }
                      className="rounded border-input"
                    />
                    Membros podem visualizar
                  </label>
                  <label className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.allowFamilyPost}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          allowFamilyPost: event.target.checked,
                        }))
                      }
                      className="rounded border-input"
                    />
                    Membros podem lançar
                  </label>
                  <label className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.allowFamilyEdit}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          allowFamilyEdit: event.target.checked,
                        }))
                      }
                      className="rounded border-input"
                    />
                    Membros podem editar a conta
                  </label>
                </FormSection>
              ) : null}
            </div>

            <SheetFooter>
              <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                  disabled={saving}
                >
                  Cancelar
                </Button>

                <Button type="submit" className="shadow-sm" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : editingId ? (
                    "Salvar alterações"
                  ) : (
                    "Criar conta"
                  )}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Card className="animate-enter-delayed border-border/50 shadow-sm">
        <CardHeader className="border-b border-border/50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <CardTitle className="font-semibold">Contas</CardTitle>
            <div className="flex flex-wrap gap-5 sm:justify-end">
              <div className="text-left sm:text-right">
                <p className="text-xs text-muted-foreground">Saldo real</p>
                <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                  {formatCurrency(totalBalance)}
                </p>
              </div>
              {forecastAccounts.length > 0 ? (
                <div className="border-l border-border/60 pl-5 text-left sm:text-right">
                  <p className="text-xs text-muted-foreground">
                    Saldo provisionado
                  </p>
                  <p className="text-xl font-semibold tracking-tight text-sky-700 tabular-nums dark:text-sky-300">
                    {formatCurrency(forecastBalance)}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando contas...
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wallet className="size-5" />
              </div>
              <p className="text-sm font-medium">Nenhuma conta cadastrada</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Crie sua primeira conta para começar a organizar os saldos.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {accounts.map((account) => {
                const isForecast = account.account_mode === "forecast";
                const editable = canManageAccount(account);
                const cardStatement =
                  account.type === "credit_card"
                    ? resolveContasCardStatementContext({
                        account,
                        transactions: cardTransactions,
                        referenceDate: statementReferenceDate,
                      })
                    : null;

                return (
                  <div
                    key={account.id}
                    className={`group -mx-2 flex flex-col gap-3 rounded-xl border px-2 py-4 transition-colors first:mt-0 last:mb-0 sm:flex-row sm:items-center sm:justify-between ${
                      isForecast
                        ? "my-2 border-dashed border-sky-300/60 bg-sky-50/50 hover:bg-sky-50 dark:border-sky-800/60 dark:bg-sky-950/20 dark:hover:bg-sky-950/30"
                        : "border-transparent hover:bg-muted/40"
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-3">
                      <AccountIdentity
                        account={account}
                        size="lg"
                        showName
                        showType
                        showScope
                        description={
                          account.families?.name
                            ? `Família: ${account.families.name}`
                            : null
                        }
                        className="w-full items-start"
                      />
                      {account.type === "credit_card" ? (
                        <CreditCardStatementSummary
                          account={account}
                          transactions={cardTransactions}
                          cycle={cardStatement?.cycle}
                          referenceDate={statementReferenceDate}
                        />
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-left sm:text-right">
                        <p className="text-xs text-muted-foreground">
                          {isForecast ? "Provisionado" : "Saldo"}
                        </p>
                        <p
                          className={`text-lg font-semibold tabular-nums ${
                            Number(account.balance) >= 0
                              ? "text-foreground"
                              : "text-destructive"
                          }`}
                        >
                          {formatCurrency(Number(account.balance))}
                        </p>
                      </div>

                      {editable ? (
                        <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => handleEdit(account)}
                            aria-label={`Editar ${account.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => handleDelete(account)}
                            aria-label={`Excluir ${account.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
