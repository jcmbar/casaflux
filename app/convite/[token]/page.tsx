"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { Loader2, LogOut, Users } from "lucide-react";

import {
  AuthMessage,
  AuthShell,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  mapInvitationError,
  parseAcceptResult,
  parseInvitationPreview,
} from "@/lib/family/invitations";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { FamilyInvitationPreview } from "@/types/family";

type PageState =
  | "loading"
  | "invalid"
  | "expired"
  | "accepted"
  | "ready"
  | "accepting"
  | "done"
  | "already_member"
  | "email_mismatch";

export default function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient()!, []);
  const { token } = use(params);
  const [preview, setPreview] = useState<FamilyInvitationPreview | null>(null);
  const [state, setState] = useState<PageState>("loading");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadPreview() {
      setState("loading");

      const [{ data: previewData }, { data: userData }] = await Promise.all([
        supabase.rpc("preview_family_invitation", { p_token: token }),
        supabase.auth.getUser(),
      ]);

      const parsed = parseInvitationPreview(previewData);
      setPreview(parsed);
      setUserEmail(userData.user?.email ?? null);

      if (!parsed || parsed.status === "invalid") {
        setState("invalid");
        return;
      }

      if (parsed.status === "expired") {
        setState("expired");
        return;
      }

      if (parsed.status === "accepted") {
        setState("accepted");
        return;
      }

      if (userData.user && parsed.invitedEmail) {
        const matches =
          userData.user.email?.trim().toLowerCase() ===
          parsed.invitedEmail.trim().toLowerCase();

        if (!matches) {
          setState("email_mismatch");
          return;
        }
      }

      setState("ready");
    }

    loadPreview();
  }, [supabase, token]);

  async function handleAccept() {
    setState("accepting");
    setMessage(null);

    const { data, error } = await supabase.rpc("accept_family_invitation", {
      p_token: token,
    });

    if (error) {
      setMessage(mapInvitationError(error.message));
      setState("ready");
      return;
    }

    const result = parseAcceptResult(data);

    if (result?.status === "already_member") {
      setState("already_member");
      return;
    }

    if (result?.status === "accepted") {
      setState("done");
      setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 1200);
      return;
    }

    setMessage("Não foi possível concluir o convite.");
    setState("ready");
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.refresh();
    setUserEmail(null);
    setState("ready");
  }

  const redirectTo = `/convite/${token}`;
  const invitedEmail = preview?.invitedEmail ?? "";
  const loginHref = `/login?redirectTo=${encodeURIComponent(redirectTo)}${
    invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : ""
  }`;
  const signupHref = `/signup?redirectTo=${encodeURIComponent(redirectTo)}${
    invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : ""
  }`;

  if (state === "loading") {
    return (
      <AuthShell
        title="Convite para família"
        description="Validando o convite..."
      >
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando...
        </div>
      </AuthShell>
    );
  }

  if (state === "invalid") {
    return (
      <AuthShell
        title="Convite inválido"
        description="Este link não corresponde a um convite ativo."
      >
        <AuthMessage tone="error">
          Verifique o link recebido ou peça um novo convite.
        </AuthMessage>
      </AuthShell>
    );
  }

  if (state === "expired") {
    return (
      <AuthShell
        title="Convite expirado"
        description="Este convite não está mais disponível."
      >
        <AuthMessage tone="error">
          Solicite um novo convite ao administrador da família.
        </AuthMessage>
      </AuthShell>
    );
  }

  if (state === "accepted") {
    return (
      <AuthShell
        title="Convite já utilizado"
        description="Este convite já foi aceito anteriormente."
      >
        <AuthMessage tone="info">
          Se você já deveria ter acesso, faça login normalmente.
        </AuthMessage>
        <div className="mt-4">
          <Link
            href="/login"
            className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Ir para login
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (state === "done" || state === "already_member") {
    return (
      <AuthShell
        title="Tudo certo"
        description={
          state === "already_member"
            ? "Você já faz parte desta família."
            : "Convite aceito com sucesso."
        }
      >
        <AuthMessage tone="success">
          Redirecionando para o app...
        </AuthMessage>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Entrar na família"
      description="Você recebeu um convite para participar de uma família no CasaFlux."
    >
      <div className="space-y-4">
        <div className="rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold" data-testid="invite-family-name">
                {preview?.familyName ?? "Família"}
              </p>
              <p className="text-sm text-muted-foreground">
                Papel: {preview?.role ?? "member"}
              </p>
              {preview?.expiresAt ? (
                <p className="text-sm text-muted-foreground">
                  Expira em {formatDate(preview.expiresAt.slice(0, 10))}
                </p>
              ) : null}
              {preview?.invitedEmail ? (
                <p className="mt-2 text-sm" data-testid="invite-email">
                  Convidado: <strong>{preview.invitedEmail}</strong>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {message ? <AuthMessage tone="error">{message}</AuthMessage> : null}

        {state === "email_mismatch" ? (
          <AuthMessage tone="error">
            Este convite é para <strong>{preview?.invitedEmail}</strong>, mas
            você está autenticado como <strong>{userEmail}</strong>.
          </AuthMessage>
        ) : null}

        {!userEmail ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Faça login ou crie uma conta com o e-mail convidado para aceitar.
            </p>
            <Link
              href={loginHref}
              data-testid="invite-login-link"
              className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              Entrar
            </Link>
            <Link
              href={signupHref}
              data-testid="invite-signup-link"
              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
            >
              Criar conta
            </Link>
          </div>
        ) : state === "email_mismatch" ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sair e entrar com outra conta
          </Button>
        ) : (
          <Button
            type="button"
            className="w-full"
            disabled={state === "accepting"}
            data-testid="accept-invite-button"
            onClick={handleAccept}
          >
            {state === "accepting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Aceitando convite...
              </>
            ) : (
              "Aceitar convite"
            )}
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
