"use client";

import Link from "next/link";
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

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const redirectTo = searchParams.get("redirectTo") ?? "/onboarding";
  const invitedEmail = searchParams.get("email") ?? "";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loginHref = `/login?redirectTo=${encodeURIComponent(redirectTo)}${
    invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : ""
  }`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
      },
    });

    if (signUpError) {
      setError(
        "Não foi possível criar a conta. Verifique os dados e tente novamente.",
      );
      setLoading(false);
      return;
    }

    if (!data.session) {
      setError(
        "Conta criada. Confirme seu e-mail antes de continuar ou desative a confirmação no Supabase para desenvolvimento.",
      );
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    setTimeout(() => {
      router.replace(redirectTo);
      router.refresh();
    }, 1200);
  }

  return (
    <AuthShell
      title="Criar conta"
      description={
        invitedEmail
          ? "Use o mesmo e-mail do convite para concluir a entrada na família."
          : "Comece a organizar as finanças da sua família."
      }
      footer={
        <>
          Já tem conta? <AuthLink href={loginHref}>Entrar</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {success ? (
          <AuthMessage tone="success">
            Conta criada com sucesso. Redirecionando...
          </AuthMessage>
        ) : null}

        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

        <AuthField
          id="fullName"
          label="Nome completo"
          value={fullName}
          onChange={setFullName}
          autoComplete="name"
          required
        />

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
          autoComplete="new-password"
          minLength={6}
          required
        />

        <Button
          type="submit"
          size="lg"
          className="w-full shadow-sm"
          disabled={loading || success}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Criando conta...
            </>
          ) : (
            "Criar conta"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
