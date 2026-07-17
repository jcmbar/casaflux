"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  AuthField,
  AuthLink,
  AuthMessage,
  AuthShell,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type ResetState = "loading" | "ready" | "expired" | "success" | "error";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient()!, []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<ResetState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function prepareRecoverySession() {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type");

      if (accessToken && refreshToken && type === "recovery") {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          setState("expired");
          return;
        }

        window.history.replaceState({}, document.title, window.location.pathname);
        setState("ready");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setState(user ? "ready" : "expired");
    }

    prepareRecoverySession();
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setSaving(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError("Não foi possível redefinir a senha. Solicite um novo link.");
      setState("error");
      setSaving(false);
      return;
    }

    setState("success");
    setSaving(false);

    setTimeout(() => {
      router.replace("/dashboard");
      router.refresh();
    }, 1500);
  }

  if (state === "loading") {
    return (
      <AuthShell
        title="Redefinir senha"
        description="Validando o link de recuperação..."
      >
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando...
        </div>
      </AuthShell>
    );
  }

  if (state === "expired") {
    return (
      <AuthShell
        title="Link expirado"
        description="Este link de recuperação não é mais válido."
        footer={
          <AuthLink href="/forgot-password">Solicitar novo link</AuthLink>
        }
      >
        <AuthMessage tone="error">
          O link expirou ou já foi utilizado. Solicite uma nova recuperação de
          senha.
        </AuthMessage>
      </AuthShell>
    );
  }

  if (state === "success") {
    return (
      <AuthShell
        title="Senha alterada"
        description="Sua nova senha foi definida com sucesso."
      >
        <AuthMessage tone="success">Redirecionando para o app...</AuthMessage>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Redefinir senha"
      description="Defina uma nova senha para sua conta."
      footer={<AuthLink href="/login">Voltar para o login</AuthLink>}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

        <AuthField
          id="password"
          label="Nova senha"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={6}
          required
        />

        <AuthField
          id="confirmPassword"
          label="Confirmar nova senha"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          minLength={6}
          required
        />

        <Button type="submit" size="lg" className="w-full shadow-sm" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar nova senha"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
