import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { ImportReviewView } from "@/components/finance/integracoes/import-review-view";

export default function NovaImportacaoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando…
        </div>
      }
    >
      <ImportReviewView />
    </Suspense>
  );
}
