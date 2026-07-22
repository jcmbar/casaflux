"use client";

import { Loader2, Mail, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { FormInput } from "@/components/forms/form-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppContext } from "@/contexts/app-context";
import {
  getPendingEmailChange,
  requestEmailChange,
} from "@/lib/auth/change-email";
import { updateFullName } from "@/lib/auth/update-profile";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function ProfileSettingsCard() {
  const supabase = useMemo(() => createClient()!, []);
  const { user, profile, refresh } = useAppContext();

  const currentName = profile?.full_name?.trim() ?? "";
  const currentEmail =
    profile?.email?.trim() || user?.email?.trim() || "";
  const pendingFromAuth = getPendingEmailChange(user);

  const [fullName, setFullName] = useState(currentName);
  const [email, setEmail] = useState(currentEmail);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(
    pendingFromAuth,
  );
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    setFullName(currentName);
  }, [currentName]);

  useEffect(() => {
    setEmail(currentEmail);
  }, [currentEmail]);

  useEffect(() => {
    setPendingEmail(pendingFromAuth);
  }, [pendingFromAuth]);

  async function handleSaveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);

    if (!user) {
      setNameError("Sessão inválida. Entre novamente.");
      return;
    }

    setSavingName(true);
    const result = await updateFullName(supabase, user.id, fullName);
    setSavingName(false);

    if (!result.ok) {
      setNameError(result.message);
      toast.error(result.message);
      return;
    }

    setFullName(result.fullName);
    await refresh();
    toast.success("Nome atualizado.");
  }

  async function handleRequestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError(null);

    if (!user) {
      setEmailError("Sessão inválida. Entre novamente.");
      return;
    }

    setSavingEmail(true);
    const result = await requestEmailChange(supabase, email, currentEmail);
    setSavingEmail(false);

    if (!result.ok) {
      setEmailError(result.message);
      toast.error(result.message);
      return;
    }

    setPendingEmail(result.pendingEmail);
    await refresh();
    toast.success("Confirmação enviada. Verifique sua caixa de entrada.");
  }

  return (
    <Card className="animate-enter border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          <UserRound className="size-5 text-primary" />
          Perfil
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        <form onSubmit={(event) => void handleSaveName(event)} className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Nome</p>
            <p className="text-sm text-muted-foreground">
              Nome exibido na conta e para outros membros da família.
            </p>
          </div>

          {nameError ? (
            <p
              className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {nameError}
            </p>
          ) : null}

          <FormInput
            id="profile-full-name"
            label="Nome completo"
            type="text"
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
              setNameError(null);
            }}
            autoComplete="name"
            disabled={savingName || !user}
            aria-invalid={Boolean(nameError) || undefined}
            data-testid="profile-full-name"
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              disabled={
                savingName ||
                !user ||
                fullName.trim() === currentName
              }
              data-testid="profile-save-name"
            >
              {savingName ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar nome"
              )}
            </Button>
          </div>
        </form>

        <div className="border-t border-border/50" />

        <form
          onSubmit={(event) => void handleRequestEmailChange(event)}
          className="space-y-4"
        >
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Mail className="size-4 text-primary" />
              E-mail de login
            </p>
            <p className="text-sm text-muted-foreground">
              A troca só é concluída após confirmação por e-mail — no endereço
              atual e no novo, como no cadastro.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            E-mail atual:{" "}
            <span className="font-medium text-foreground">
              {currentEmail || "—"}
            </span>
          </p>

          {pendingEmail ? (
            <Alert
              className={cn("border-amber-500/30 bg-amber-500/5")}
              data-testid="profile-email-pending"
            >
              <Mail className="size-4 text-amber-700 dark:text-amber-300" />
              <AlertTitle>Alteração pendente</AlertTitle>
              <AlertDescription>
                Aguardando confirmação para{" "}
                <span className="font-medium text-foreground">{pendingEmail}</span>.
                Abra os links enviados ao e-mail atual e ao novo endereço para
                concluir.
              </AlertDescription>
            </Alert>
          ) : null}

          {emailError ? (
            <p
              className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {emailError}
            </p>
          ) : null}

          <FormInput
            id="profile-email"
            label="Novo e-mail"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(null);
            }}
            autoComplete="email"
            disabled={savingEmail || !user}
            aria-invalid={Boolean(emailError) || undefined}
            data-testid="profile-email"
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              disabled={savingEmail || !user}
              data-testid="profile-request-email-change"
            >
              {savingEmail ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Solicitar alteração de e-mail"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
