"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageIntro } from "@/components/layout/page-intro";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppContext } from "@/contexts/app-context";
import {
  fetchImportationDetail,
  type ImportationDetail,
  type ImportationDetailRow,
  type ImportationDetailSection,
} from "@/lib/integrations/history/importations";
import { formatCurrency, formatDate } from "@/lib/format";
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

const SECTION_PREVIEW_LIMIT = 25;

function formatImportedAt(value: string): string {
  return formatDate(value, "pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ImportacaoDetailView() {
  const params = useParams<{ batchId: string }>();
  const batchId = params.batchId;
  const supabase = useMemo(() => createClient()!, []);
  const { user } = useAppContext();
  const [detail, setDetail] = useState<ImportationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !batchId) {
      setDetail(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchImportationDetail(supabase, {
        batchId,
        ownerUserId: user!.id,
      });
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setDetail(null);
      } else {
        setDetail(result.detail);
      }
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [batchId, supabase, user]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Carregando importação…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card className="border-destructive/30">
          <CardContent className="py-6 text-sm text-destructive">
            Não foi possível carregar esta importação: {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Importação não encontrada.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <BackLink />
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {detail.title}
            </h2>
            <Badge
              variant="outline"
              className={cn("font-normal", STATUS_BADGE_CLASS[detail.status])}
            >
              {detail.statusLabel}
            </Badge>
          </div>
          <PageIntro description="Veja o que esta importação gerou, o que foi ignorado e importe novamente com o mesmo contexto quando precisar." />
        </div>

        <Link
          href={detail.reimportHref}
          className={cn(buttonVariants(), "shrink-0 gap-2 self-start")}
          data-testid="importacao-reimportar"
        >
          <RefreshCw className="size-4" />
          Importar novamente
        </Link>
      </div>

      <section className="space-y-3" aria-labelledby="importacao-resumo">
        <h3 id="importacao-resumo" className="text-sm font-medium">
          Resumo
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat label="Arquivo" value={detail.fileName ?? "—"} />
          <SummaryStat
            label="Conta"
            value={detail.accountName ?? "Conta vinculada"}
          />
          <SummaryStat
            label="Quando"
            value={formatImportedAt(detail.importedAt)}
          />
          <SummaryStat label="Origem" value={detail.sourceLabel} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat
            label="Linhas no arquivo"
            value={String(detail.summary.fileRows)}
          />
          <SummaryStat
            label="Lançamentos criados"
            value={String(detail.summary.createdLaunches)}
          />
          <SummaryStat
            label="Itens ignorados"
            value={String(detail.summary.ignoredItems)}
          />
          <SummaryStat
            label="Pagamentos de fatura"
            value={String(detail.summary.invoicePayments)}
          />
        </div>
      </section>

      {detail.sections.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-8 text-sm text-muted-foreground">
            Nenhum item registrado nesta importação.
          </CardContent>
        </Card>
      ) : (
        detail.sections.map((section) => (
          <DetailSectionCard key={section.id} section={section} />
        ))
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href={detail.reimportHref}
          className={cn(buttonVariants(), "gap-2")}
        >
          <RefreshCw className="size-4" />
          Importar novamente
        </Link>
        <Link
          href="/importacoes"
          className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
        >
          Ver histórico
        </Link>
      </div>
    </div>
  );
}

function DetailSectionCard({ section }: { section: ImportationDetailSection }) {
  const previewRows = section.rows.slice(0, SECTION_PREVIEW_LIMIT);

  return (
    <Card className="border-border/50" data-testid={`importacao-section-${section.id}`}>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <div className="flex size-9 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
          <FileSpreadsheet className="size-4" />
        </div>
        <div>
          <CardTitle className="text-base">
            {section.label}
            <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
              ({section.rows.length})
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">{section.description}</p>
          {section.rows.length > previewRows.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Mostrando os primeiros {previewRows.length} de {section.rows.length}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {previewRows.map((row) => (
          <DetailRowItem key={row.id} row={row} />
        ))}
      </CardContent>
    </Card>
  );
}

function DetailRowItem({ row }: { row: ImportationDetailRow }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium">{row.description}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(row.rowDate)} · {row.kindLabel} · {row.resultLabel}
        </p>
      </div>
      <p
        className={cn(
          "shrink-0 text-sm font-medium tabular-nums",
          row.direction === "in"
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-foreground",
        )}
      >
        {row.direction === "in" ? "+" : "−"}
        {formatCurrency(row.amount)}
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/importacoes"
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "-ml-2 gap-1.5 text-muted-foreground",
      )}
    >
      <ArrowLeft className="size-4" />
      Importações
    </Link>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}
