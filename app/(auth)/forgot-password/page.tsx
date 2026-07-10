"use client";

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
import { getSiteUrl } from "@/lib/supabase/env";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const redirectTo = `${getSiteUrl()}/auth/callback?next=/reset-password`;

    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    setSubmitted(true);
    setLoading(false);
  }

  return (
    <AuthShell
      title="Recuperar senha"
      description="Enviaremos um link para redefinir sua senha."
      footer={<AuthLink href="/login">Voltar para o login</AuthLink>}
    >
      {submitted ? (
        <AuthMessage tone="success">
          Se existir uma conta com esse e-mail, você receberá instruções para
          redefinir a senha em instantes.
        </AuthMessage>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <AuthField
            id="email"
            label="E-mail"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />

          <Button type="submit" size="lg" className="w-full shadow-sm" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar link de recuperação"
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
