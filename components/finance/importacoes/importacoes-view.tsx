"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, Plus, Upload } from "lucide-react";
import Link from "next/link";

import { PageIntro } from "@/components/layout/page-intro";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppContext } from "@/contexts/app-context";
import { ImportIntegrationSummaries } from "@/components/finance/importacoes/import-integration-summaries";
import { ImportCsvOnboarding } from "@/components/finance/importacoes/import-csv-onboarding";
import { getImportationsListIntro } from "@/lib/integrations/catalog/import-integrations";
import {
  getImportationsEmptyMessage,
  listImportations,
  type ImportationListItem,
} from "@/lib/integrations/history/importations";
import { buildImportIntegrationHistorySummaries } from "@/lib/integrations/history/integration-summaries";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { ImportBatchStatus } from "@/lib/integrations/history/types";

const STATUS_BADGE_CLASS: Record<ImportBatchStatus, string> = {
  committed:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
  registered:
    "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  failed: "border-rose-500/25 bg-rose-500/10 text-rose-900 dark:text-rose-100",
};

function formatImportedAt(value: string): string {
  return formatDate(value, "pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ImportacoesView() {
  const supabase = useMemo(() => createClient()!, []);
  const { user } = useAppContext();
  const [items, setItems] = useState<ImportationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const result = await listImportations(supabase, {
        ownerUserId: user!.id,
      });
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setItems([]);
      } else {
        setItems(result.items);
      }
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  const integrationSummaries = useMemo(
    () => buildImportIntegrationHistorySummaries(items),
    [items],
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageIntro description={getImportationsListIntro()} />
        <Link
          href="/importacoes/nova"
          className={cn(buttonVariants(), "shrink-0 gap-2 self-start")}
        >
          <Plus className="size-4" />
          Nova importação
        </Link>
      </div>

      {!loading && !error ? (
        <ImportIntegrationSummaries summaries={integrationSummaries} />
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando importações…
        </div>
      ) : error ? (
        <Card className="border-destructive/30">
          <CardContent className="py-6 text-sm text-destructive">
            Não foi possível carregar o histórico.
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-start gap-4 py-10">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <Upload className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Nenhuma importação ainda</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {getImportationsEmptyMessage()}
              </p>
            </div>
            <Link
              href="/importacoes/nova"
              className={cn(buttonVariants(), "gap-2")}
            >
              <Plus className="size-4" />
              Nova importação
            </Link>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3" aria-labelledby="importations-history">
          <div className="space-y-1">
            <h2
              id="importations-history"
              className="text-sm font-medium text-foreground"
            >
              Histórico
            </h2>
            <p className="text-xs text-muted-foreground">
              Arquivos já importados, do mais recente ao mais antigo.
            </p>
          </div>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="block rounded-xl border border-border/50 bg-card/40 p-4 transition-colors hover:border-border hover:bg-card/70"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-3">
                      <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
                        <FileSpreadsheet className="size-4" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{item.title}</p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-normal",
                              STATUS_BADGE_CLASS[item.status],
                            )}
                          >
                            {item.statusLabel}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.sourceLabel}
                          {" · "}
                          {item.accountName ?? "Conta vinculada"}
                          {item.fileName ? ` · ${item.fileName}` : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatImportedAt(item.importedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:text-right">
                      <span className="text-muted-foreground">
                        Linhas no arquivo
                      </span>
                      <span className="font-medium tabular-nums">
                        {item.rowCount}
                      </span>
                      <span className="text-muted-foreground">
                        Lançamentos criados
                      </span>
                      <span className="font-medium tabular-nums">
                        {item.createdLaunchCount}
                      </span>
                      <span className="text-muted-foreground">
                        Linhas ignoradas
                      </span>
                      <span className="font-medium tabular-nums">
                        {item.ignoredItemCount}
                      </span>
                      {item.invoicePaymentCount > 0 ? (
                        <>
                          <span className="text-muted-foreground">
                            Pagamentos de fatura
                          </span>
                          <span className="font-medium tabular-nums">
                            {item.invoicePaymentCount}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ImportCsvOnboarding />

      {!loading && items.length > 0 ? (
        <div className="flex justify-end">
          <Link
            href="/importacoes/nova"
            className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
          >
            <Plus className="size-4" />
            Nova importação
          </Link>
        </div>
      ) : null}
    </div>
  );
}
