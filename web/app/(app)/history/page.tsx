import { HistoryAlertCard } from "@/components/history-alert-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  findReplayPreviewForRuleName,
  getAlertRuleReplayPreviews,
} from "@/lib/alerts/replay";
import { getAlertRulesForCurrentUser } from "@/lib/alerts/rules";
import {
  getEngineDeliveryLabel,
  summarizeEngineDelivery,
} from "@/lib/engine-status/presentation";
import { getEngineRuntimeSummary } from "@/lib/engine-status/source";
import { getHistorySource } from "@/lib/history/source";

function getHistorySourceLabel(source: "engine" | "mock" | "supabase") {
  switch (source) {
    case "supabase":
      return "Persisted history";
    case "engine":
      return "Engine live";
    default:
      return "Mock fallback";
  }
}

export default async function HistoryPage() {
  const engine = await getEngineRuntimeSummary();
  const history = await getHistorySource();
  const rules = await getAlertRulesForCurrentUser();
  const replayPreviews = await getAlertRuleReplayPreviews(rules);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Snapshot-first</Badge>
            <Badge variant={history.source === "supabase" ? "default" : "secondary"}>
              {getHistorySourceLabel(history.source)}
            </Badge>
          </div>
          <CardTitle>Proof history</CardTitle>
          <CardDescription>
            History is intentionally snapshot-focused. We are building a review
            surface, not a full charting terminal.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-medium">Review objective</p>
            <p className="mt-1 text-sm text-muted-foreground">
              One mobile-friendly proof card per alert, with no dense terminal behavior.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-medium">Proof contract</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Content, media type, dimensions, and content hash stay explicit for delivery and history.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-medium">Launch posture</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Persisted user history is preferred when available; live engine and mock data remain safe fallback paths.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Delivery visibility</Badge>
            <Badge
              variant={
                engine?.deliveryStatus === "configured"
                  ? "default"
                  : engine?.deliveryStatus === "degraded"
                    ? "destructive"
                    : "secondary"
              }
            >
              {getEngineDeliveryLabel(engine?.deliveryStatus)}
            </Badge>
          </div>
          <CardTitle>Engine delivery trust</CardTitle>
          <CardDescription>{summarizeEngineDelivery(engine)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Dispatch attempts</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {engine?.dispatchAttempts ?? "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Delivered alerts</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {engine?.deliveredAlerts ?? "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Retry attempts</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {engine?.retryAttempts ?? "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Persisted writes</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {engine?.persistedWrites ?? "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      {history.items.length ? (
        <div className="grid gap-6">
          {history.items.map((item) => (
            <HistoryAlertCard
              key={item.id}
              item={item}
              replayPreview={findReplayPreviewForRuleName(rules, replayPreviews, item.ruleName)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No alerts yet</CardTitle>
            <CardDescription>
              Triggered alerts will appear here with proof snapshots and delivery state once
              the live engine starts writing history.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
