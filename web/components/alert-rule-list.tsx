import Link from "next/link";

import { deleteAlertRule } from "@/app/(app)/alerts/actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { describeAlertRule } from "@/lib/alerts/presentation";
import type { AlertRule } from "@/lib/alerts/schema";
import { cn } from "@/lib/utils";

type AlertRuleListProps = {
  rules: AlertRule[];
};

export function AlertRuleList({ rules }: AlertRuleListProps) {
  if (!rules.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background p-5">
        <p className="text-sm text-muted-foreground">
          No alert rules yet. Create one guided rule to start shaping the v1 signal loop.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="flex flex-col gap-4 rounded-xl border border-border bg-background p-5"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{rule.name}</h3>
                <Badge variant={rule.status === "active" ? "default" : "secondary"}>
                  {rule.status === "active" ? "Active" : "Paused"}
                </Badge>
                <Badge variant="outline">{rule.marketSymbol}</Badge>
                <Badge variant="outline">{rule.timeframe}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {rule.ruleType === "stacked_imbalance"
                  ? "Stacked imbalance"
                  : "Trapped traders"}{" "}
                · {describeAlertRule(rule)}
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href={`/alerts?edit=${rule.id}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Edit
              </Link>
              <form action={deleteAlertRule}>
                <input type="hidden" name="id" value={rule.id} />
                <button
                  type="submit"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Delete
                </button>
              </form>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
