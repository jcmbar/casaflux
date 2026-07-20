"use client";

import { AccountIdentityMark } from "@/components/finance/account-identity";
import {
  hasImportIntegrationHistoryActivity,
  type ImportIntegrationHistorySummary,
} from "@/lib/integrations/history/integration-summaries";
import { cn } from "@/lib/utils";

export function ImportIntegrationSummaries({
  summaries,
  className,
}: {
  summaries: ImportIntegrationHistorySummary[];
  className?: string;
}) {
  if (!hasImportIntegrationHistoryActivity(summaries)) return null;

  return (
    <section
      className={cn("space-y-3", className)}
      aria-labelledby="import-integration-summaries"
      data-testid="import-integration-summaries"
    >
      <div className="space-y-1">
        <h2
          id="import-integration-summaries"
          className="text-sm font-medium text-foreground"
        >
          Resumo por banco
        </h2>
        <p className="text-xs text-muted-foreground">
          O que já entrou em cada banco disponível hoje.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summaries.map((summary) => (
          <div
            key={summary.providerId}
            className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/40 px-4 py-4"
            data-testid={`import-integration-summary-${summary.providerId}`}
          >
            <AccountIdentityMark
              account={{ name: summary.name }}
              size="md"
            />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">{summary.name}</p>
              <p className="text-xs text-muted-foreground">
                {summary.metricsLabel}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
