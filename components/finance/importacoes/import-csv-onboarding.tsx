"use client";

import { AccountIdentityMark } from "@/components/finance/account-identity";
import { Badge } from "@/components/ui/badge";
import { IMPORT_AVAILABILITY_LABELS } from "@/lib/integrations/catalog/import-integrations";
import {
  buildImportCsvOnboardingCards,
  type ImportExportOnboardingCard,
} from "@/lib/integrations/catalog/import-export-onboarding";
import { cn } from "@/lib/utils";

const availabilityBadgeClass = {
  supported:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
  planned: "border-border/50 bg-muted/40 text-muted-foreground",
} as const;

function OnboardingBankCard({ card }: { card: ImportExportOnboardingCard }) {
  const isPlannedBank = card.status === "planned";
  const supportedLayouts = card.layouts.filter(
    (layout) => layout.status === "supported" && layout.steps,
  );
  const plannedLayouts = card.layouts.filter(
    (layout) => layout.status === "planned",
  );

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-4",
        isPlannedBank
          ? "border-border/40 bg-muted/15"
          : "border-border/50 bg-card/40",
      )}
      data-testid={`import-csv-onboarding-${card.providerId}`}
      data-status={card.status}
    >
      <div className="flex items-start gap-3">
        <AccountIdentityMark account={{ name: card.name }} size="md" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{card.name}</h3>
            <Badge
              variant="outline"
              className={cn(
                "font-normal",
                availabilityBadgeClass[card.status],
              )}
            >
              {IMPORT_AVAILABILITY_LABELS[card.status]}
            </Badge>
          </div>
          {isPlannedBank ? (
            <p className="text-xs text-muted-foreground">
              Ainda não é possível importar arquivos deste banco.
            </p>
          ) : null}
        </div>
      </div>

      {!isPlannedBank ? (
        <div className="space-y-3">
          {supportedLayouts.map((layout) => (
            <div key={`${card.providerId}-${layout.kind}`} className="space-y-2">
              <p className="text-xs font-medium text-foreground">
                {layout.layoutName}
              </p>
              <ol className="space-y-1.5">
                {layout.steps!.map((step, index) => (
                  <li
                    key={`${layout.kind}-${index}`}
                    className="flex gap-2 text-xs text-muted-foreground"
                  >
                    <span
                      className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium tabular-nums text-foreground"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}

          {plannedLayouts.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {IMPORT_AVAILABILITY_LABELS.planned}:{" "}
              {plannedLayouts.map((layout) => layout.shortLabel).join(", ")}.
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ImportCsvOnboarding({ className }: { className?: string }) {
  const cards = buildImportCsvOnboardingCards();

  if (cards.length === 0) return null;

  return (
    <section
      className={cn("space-y-3", className)}
      aria-labelledby="import-csv-onboarding"
      data-testid="import-csv-onboarding"
    >
      <div className="space-y-1">
        <h2
          id="import-csv-onboarding"
          className="text-sm font-medium text-foreground"
        >
          Como exportar o CSV
        </h2>
        <p className="text-xs text-muted-foreground">
          Bancos disponíveis hoje e o que vem em breve.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <OnboardingBankCard key={card.providerId} card={card} />
        ))}
      </div>
    </section>
  );
}
