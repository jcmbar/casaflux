"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { Loader2, Mail, Users } from "lucide-react";

import { useAppContext } from "@/contexts/app-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient()!, []);
  const { user, refresh } = useAppContext();
  const [familyName, setFamilyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateFamily(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !familyName.trim()) {
      return;
    }

    setLoading(true);
    setError(null);

    const { data: slug, error: slugError } = await supabase.rpc(
      "generate_family_slug",
      { p_name: familyName.trim() },
    );

    if (slugError || !slug) {
      console.error(slugError);
      setError("Não foi possível gerar o identificador da família.");
      setLoading(false);
      return;
    }

    const { data: family, error: familyError } = await supabase
      .from("families")
      .insert({
        name: familyName.trim(),
        slug,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (familyError || !family) {
      console.error(familyError);
      setError("Não foi possível criar a família.");
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase.from("family_members").insert({
      family_id: family.id,
      user_id: user.id,
      role: "owner",
      can_invite: true,
    });

    if (memberError) {
      console.error(memberError);
      setError("Família criada, mas não foi possível vincular sua conta.");
      setLoading(false);
      return;
    }

    await refresh();
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center space-y-8">
      <div className="animate-enter space-y-3 text-center md:text-left">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Passo 1 de 1
        </p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Bem-vindo ao CasaFlux
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Crie sua família para compartilhar contas e lançamentos com quem você
          confia.
        </p>
      </div>

      <Card className="animate-enter-delayed border-border/50 shadow-md">
        <CardHeader className="space-y-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Users className="size-5" />
          </div>
          <CardTitle className="text-lg font-semibold">Criar nova família</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateFamily} className="space-y-5">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="familyName">Nome da família</Label>
              <Input
                id="familyName"
                type="text"
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
                placeholder="Ex.: Família Silva"
                className="h-10 bg-surface-sunken/60 dark:bg-input/40"
                required
              />
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="w-full shadow-sm sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparando sua família...
                </>
              ) : (
                "Criar família"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="animate-enter-delayed border-border/40 bg-muted/30 shadow-none">
        <CardHeader className="space-y-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-background text-muted-foreground ring-1 ring-border/60">
            <Mail className="size-5" />
          </div>
          <CardTitle className="text-base font-medium">Entrar com convite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            Se você recebeu um link de convite, abra-o no navegador para entrar
            na família com o e-mail convidado.
          </p>
          <p>
            Depois de aceitar, você será redirecionado automaticamente para o
            app.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
