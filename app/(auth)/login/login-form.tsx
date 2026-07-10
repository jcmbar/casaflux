"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  AuthField,
  AuthLink,
  AuthMessage,
  AuthShell,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";
  const invitedEmail = searchParams.get("email") ?? "";
  const callbackError = searchParams.get("error");

  const signupHref = `/signup?redirectTo=${encodeURIComponent(redirectTo)}${
    invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : ""
  }`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("E-mail ou senha inválidos.");
      setLoading(false);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <AuthShell
      title="Entrar"
      description="Acesse suas finanças pessoais e familiares com segurança."
      footer={
        <>
          Não tem conta?{" "}
          <AuthLink href={signupHref}>Criar conta</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {callbackError ? (
          <AuthMessage tone="error">
            Não foi possível concluir a autenticação. Tente novamente.
          </AuthMessage>
        ) : null}

        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

        <AuthField
          id="email"
          label="E-mail"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
        />

        <AuthField
          id="password"
          label="Senha"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
        />

        <div className="text-right">
          <AuthLink href="/forgot-password" className="text-sm">
            Esqueci minha senha
          </AuthLink>
        </div>

        <Button type="submit" size="lg" className="w-full shadow-sm" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Entrando...
            </>
          ) : (
            "Entrar"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
