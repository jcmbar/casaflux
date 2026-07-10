import { Link2, PencilLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  getGoalProgressSourceLabel,
  isGoalAutomaticProgress,
} from "@/lib/finance/goal-progress";
import type { Goal } from "@/types/goal";
import { cn } from "@/lib/utils";

export function GoalProgressBadge({
  goal,
  className,
}: {
  goal: Goal;
  className?: string;
}) {
  const automatic = isGoalAutomaticProgress(goal);

  return (
    <Badge
      variant="outline"
      data-testid="goal-progress-badge"
      className={cn(
        "gap-1 font-normal",
        automatic
          ? "border-primary/25 bg-primary/5 text-primary"
          : "border-border bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      {automatic ? (
        <Link2 className="size-3 shrink-0" aria-hidden />
      ) : (
        <PencilLine className="size-3 shrink-0" aria-hidden />
      )}
      {getGoalProgressSourceLabel(goal)}
    </Badge>
  );
}
