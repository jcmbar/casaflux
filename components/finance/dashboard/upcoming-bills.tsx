import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { upcomingBills } from "@/data/mock/dashboard";

const statusMap = {
  alto: "border-destructive/25 bg-destructive/5 text-destructive",
  médio: "border-border bg-muted/60 text-foreground",
  baixo: "border-primary/25 bg-primary/5 text-primary",
};

export function UpcomingBills() {
  return (
    <Card className="animate-enter-delayed border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="font-semibold">Próximos vencimentos</CardTitle>
      </CardHeader>

      <CardContent className="divide-y divide-border/60">
        {upcomingBills.map((bill) => (
          <div
            key={bill.title}
            className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-medium">{bill.title}</p>
              <p className="text-sm text-muted-foreground">
                Vence em {bill.dueDate}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
              <p className="font-medium tabular-nums">{bill.amount}</p>
              <Badge
                variant="outline"
                className={statusMap[bill.status as keyof typeof statusMap]}
              >
                {bill.status}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
