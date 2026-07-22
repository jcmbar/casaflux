"use client";

import { useState, type MouseEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useConfirm } from "@/components/feedback/confirm-dialog-provider";
import { Button } from "@/components/ui/button";
import {
  buildImportBatchRollbackConfirmCopy,
  previewImportBatchRollback,
  rollbackImportBatch,
} from "@/lib/integrations/history/rollback-import-batch";
import { IMPORTACOES_ROUTES } from "@/lib/integrations/history/importations";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function ImportBatchRollbackButton({
  batchId,
  ownerUserId,
  variant = "outline",
  size = "default",
  className,
  redirectToList = false,
  onRolledBack,
}: {
  batchId: string;
  ownerUserId: string;
  variant?: "outline" | "destructive" | "ghost";
  size?: "default" | "sm" | "icon";
  className?: string;
  /** After success, navigate to /importacoes (detail screen). */
  redirectToList?: boolean;
  onRolledBack?: () => void;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (busy) return;

    const supabase = createClient();
    if (!supabase) {
      toast.error("Não foi possível conectar.");
      return;
    }

    setBusy(true);
    try {
      const preview = await previewImportBatchRollback(supabase, {
        batchId,
        ownerUserId,
      });

      if (!preview.ok) {
        toast.error(preview.message);
        return;
      }

      if (!preview.impact.canRollback) {
        toast.error(
          preview.impact.blockers[0] ??
            "Não é seguro excluir esta importação no momento.",
        );
        return;
      }

      const copy = buildImportBatchRollbackConfirmCopy(preview.impact);
      const confirmed = await confirm({
        title: copy.title,
        description: copy.description,
        confirmLabel: copy.confirmLabel,
        destructive: true,
      });

      if (!confirmed) return;

      const result = await rollbackImportBatch(supabase, batchId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(
        result.deletedTransactions > 0
          ? `Importação excluída (${result.deletedTransactions} lançamento(s) removido(s)).`
          : "Importação excluída do histórico.",
      );

      onRolledBack?.();

      if (redirectToList) {
        router.push(IMPORTACOES_ROUTES.list);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("gap-2", className)}
      onClick={handleClick}
      disabled={busy}
      data-testid={`import-batch-rollback-${batchId}`}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Trash2 className="size-4" />
      )}
      Excluir importação
    </Button>
  );
}
