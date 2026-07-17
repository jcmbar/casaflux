"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Landmark,
  Loader2,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
};

const accountTypeMap: Record<
  AccountType,
  {
    label: string;
    icon: typeof Wallet;
    badgeClass: string;
  }
> = {
  checking: {
    label: "Conta corrente",
    icon: Landmark,
    badgeClass: "border-primary/25 bg-primary/5 text-primary",
  },
  savings: {
    label: "Poupança",
    icon: PiggyBank,
    badgeClass: "border-primary/20 bg-primary/5 text-primary",
  },
  cash: {
    label: "Dinheiro",
    icon: Wallet,
    badgeClass: "border-border bg-muted/60 text-foreground",
  },
  credit_card: {
    label: "Cartão de crédito",
    icon: Wallet,
    badgeClass: "border-destructive/25 bg-destructive/5 text-destructive",
  },
  investment: {
    label: "Investimento",
    icon: Landmark,
    badgeClass: "border-border bg-muted/60 text-foreground",
  },
};

export default function ContasPage() {
  const supabase = useMemo(() => createClient()!, []);
  const confirm = useConfirm();
  const { user, activeFamily, isFamilyAdmin } = useAppContext();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);

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

    setAccounts((data ?? []) as Account[]);
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
      <PageIntro description="Contas reais e previsões para organizar seus saldos." />

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
                  Previsão — provisionamento futuro
                </option>
              </FormSelect>

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
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as AccountType,
                  }))
                }
              >
                <option value="checking">Conta corrente</option>
                <option value="savings">Poupança</option>
                <option value="cash">Dinheiro</option>
                <option value="credit_card">Cartão de crédito</option>
                <option value="investment">Investimento</option>
              </FormSelect>

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
                    Saldo previsto
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
                const config = accountTypeMap[account.type];
                const isForecast = account.account_mode === "forecast";
                const Icon = isForecast ? CalendarClock : config.icon;
                const editable = canManageAccount(account);

                return (
                  <div
                    key={account.id}
                    className={`group -mx-2 flex flex-col gap-3 rounded-xl border px-2 py-4 transition-colors first:mt-0 last:mb-0 sm:flex-row sm:items-center sm:justify-between ${
                      isForecast
                        ? "my-2 border-dashed border-sky-300/60 bg-sky-50/50 hover:bg-sky-50 dark:border-sky-800/60 dark:bg-sky-950/20 dark:hover:bg-sky-950/30"
                        : "border-transparent hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10"
                        style={{
                          backgroundColor: `${account.color ?? "#0f766e"}18`,
                          color: account.color ?? "#0f766e",
                        }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 space-y-1.5">
                        <p className="truncate font-medium">{account.name}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge
                            variant="outline"
                            className={config.badgeClass}
                          >
                            {config.label}
                          </Badge>
                          {isForecast ? (
                            <Badge
                              variant="outline"
                              className="border-sky-300/70 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                            >
                              <CalendarClock className="mr-1 h-3 w-3" />
                              Previsão
                            </Badge>
                          ) : null}
                          <Badge variant="outline" className="border-border/60">
                            {account.is_family_shared ? (
                              <>
                                <Users className="mr-1 h-3 w-3" />
                                Familiar
                              </>
                            ) : (
                              "Pessoal"
                            )}
                          </Badge>
                        </div>
                        {account.families?.name ? (
                          <p className="text-xs text-muted-foreground">
                            Família: {account.families.name}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-left sm:text-right">
                        <p className="text-xs text-muted-foreground">
                          {isForecast ? "Previsto" : "Saldo"}
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
