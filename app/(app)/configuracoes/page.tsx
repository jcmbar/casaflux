"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Eraser, Loader2, Settings2 } from "lucide-react";
import Link from "next/link";

import { useConfirm } from "@/components/feedback/confirm-dialog-provider";
import { FormInput } from "@/components/forms/form-controls";
import { PageIntro } from "@/components/layout/page-intro";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppContext } from "@/contexts/app-context";
import {
  CLEANUP_ALL_CONFIRMATION_PHRASE,
  cleanupFinanceData,
  formatCleanupSummary,
  type CleanupFinanceBlock,
} from "@/lib/finance/cleanup-finance-data";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";

type BlockOption = {
  id: Exclude<CleanupFinanceBlock, "all">;
  label: string;
  description: string;
};

const BLOCK_OPTIONS: BlockOption[] = [
  {
    id: "transactions",
    label: "Lançamentos",
    description:
      "Remove lançamentos de contas e cartões, previsões, recorrências e histórico de importação CSV. Zera o saldo das contas e cartões mantidos.",
  },
  {
    id: "accounts",
    label: "Contas e cartões",
    description:
      "Remove contas bancárias, cartões (incluindo provisão) e tudo ligado a elas, inclusive histórico de importação. Metas vinculadas passam para modo manual.",
  },
  {
    id: "goals",
    label: "Metas",
    description: "Remove metas financeiras pessoais e, se você for admin, as da família ativa.",
  },
  {
    id: "budgets",
    label: "Orçamento",
    description:
      "Remove orçamentos por categoria. Categorias e preferências de exibição são mantidas.",
  },
];

export default function ConfiguracoesPage() {
  const supabase = useMemo(() => createClient()!, []);
  const confirm = useConfirm();
  const { user, activeFamily, isFamilyAdmin } = useAppContext();
  const [selected, setSelected] = useState<
    Record<Exclude<CleanupFinanceBlock, "all">, boolean>
  >({
    transactions: false,
    accounts: false,
    goals: false,
    budgets: false,
  });
  const [wipeAll, setWipeAll] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [running, setRunning] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  const selectedBlocks = useMemo(() => {
    if (wipeAll) return ["all"] as CleanupFinanceBlock[];
    return BLOCK_OPTIONS.filter((option) => selected[option.id]).map(
      (option) => option.id,
    );
  }, [selected, wipeAll]);

  function toggleBlock(id: Exclude<CleanupFinanceBlock, "all">) {
    setWipeAll(false);
    setSelected((current) => ({ ...current, [id]: !current[id] }));
    setLastSummary(null);
  }

  function toggleWipeAll(next: boolean) {
    setWipeAll(next);
    if (next) {
      setSelected({
        transactions: true,
        accounts: true,
        goals: true,
        budgets: true,
      });
    }
    setConfirmationPhrase("");
    setLastSummary(null);
  }

  async function handleCleanup() {
    if (!user || running || selectedBlocks.length === 0) return;

    if (wipeAll) {
      if (
        confirmationPhrase.trim().toUpperCase() !==
        CLEANUP_ALL_CONFIRMATION_PHRASE
      ) {
        toast.error(`Digite ${CLEANUP_ALL_CONFIRMATION_PHRASE} para confirmar.`);
        return;
      }
    } else {
      const labels = BLOCK_OPTIONS.filter((option) => selected[option.id])
        .map((option) => option.label)
        .join(", ");
      const confirmed = await confirm({
        title: "Limpar dados financeiros?",
        description: `Isso remove de forma permanente: ${labels}. Conta, perfil, família e categorias não serão apagados.`,
        confirmLabel: "Limpar agora",
        destructive: true,
      });
      if (!confirmed) return;
    }

    setRunning(true);

    const result = await cleanupFinanceData(supabase, {
      blocks: selectedBlocks,
      familyId: activeFamily?.id ?? null,
      confirmationPhrase: wipeAll ? confirmationPhrase : undefined,
    });

    setRunning(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    const summary = formatCleanupSummary(result.counts);
    setLastSummary(
      result.counts.familyIncluded
        ? `${summary} Dados compartilhados da família ativa também foram incluídos.`
        : activeFamily
          ? `${summary} Dados compartilhados da família ativa não foram alterados (é preciso ser admin).`
          : summary,
    );
    toast.success("Limpeza concluída.");
    setConfirmationPhrase("");
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageIntro description="Preferências da conta e ferramentas de manutenção dos seus dados financeiros." />

      <Card className="animate-enter border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-semibold">
            <Settings2 className="size-5 text-primary" />
            Conta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Esta área limpa apenas dados financeiros. Autenticação, perfil,
            família, convites e categorias permanecem intactos.
          </p>
          <p>
            Para gerenciar membros e convites, use{" "}
            <Link href="/familia" className="font-medium text-foreground underline-offset-4 hover:underline">
              Família
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card className="animate-enter-delayed border-destructive/20 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-semibold text-destructive">
            <Eraser className="size-5" />
            Limpeza de dados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>Ação irreversível</AlertTitle>
            <AlertDescription>
              Use para recomeçar testes em produção sem excluir a conta. O que
              for apagado não poderá ser recuperado.
            </AlertDescription>
          </Alert>

          {activeFamily ? (
            <p className="text-sm text-muted-foreground">
              Família ativa: <span className="font-medium text-foreground">{activeFamily.name}</span>
              {isFamilyAdmin
                ? " — como admin, a limpeza também inclui dados compartilhados dessa família."
                : " — dados compartilhados só entram na limpeza se você for admin."}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem família ativa: apenas dados pessoais serão considerados.
            </p>
          )}

          <div className="space-y-3">
            {BLOCK_OPTIONS.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/50 bg-muted/20 p-3"
              >
                <input
                  type="checkbox"
                  checked={wipeAll || selected[option.id]}
                  disabled={wipeAll || running}
                  onChange={() => toggleBlock(option.id)}
                  className="mt-0.5 size-4 rounded border-input accent-primary"
                  data-testid={`cleanup-block-${option.id}`}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <input
                type="checkbox"
                checked={wipeAll}
                disabled={running}
                onChange={(event) => toggleWipeAll(event.target.checked)}
                className="mt-0.5 size-4 rounded border-input accent-destructive"
                data-testid="cleanup-block-all"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">Tudo</span>
                <span className="block text-xs text-muted-foreground">
                  União de lançamentos (contas + cartões), contas/cartões, histórico
                  de importação, metas e orçamento. Não apaga conta de acesso,
                  perfil, família nem categorias. Exige digitar{" "}
                  {CLEANUP_ALL_CONFIRMATION_PHRASE}.
                </span>
              </span>
            </label>
          </div>

          {wipeAll ? (
            <FormInput
              id="cleanup-confirmation"
              label={`Digite ${CLEANUP_ALL_CONFIRMATION_PHRASE} para confirmar`}
              type="text"
              value={confirmationPhrase}
              onChange={(event) => setConfirmationPhrase(event.target.value)}
              placeholder={CLEANUP_ALL_CONFIRMATION_PHRASE}
              autoComplete="off"
              data-testid="cleanup-all-confirmation"
            />
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="destructive"
              disabled={running || selectedBlocks.length === 0}
              onClick={() => void handleCleanup()}
              data-testid="cleanup-submit"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Limpando...
                </>
              ) : wipeAll ? (
                "Apagar tudo"
              ) : (
                "Limpar seleção"
              )}
            </Button>
          </div>

          {lastSummary ? (
            <p
              className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm"
              data-testid="cleanup-summary"
            >
              {lastSummary}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
