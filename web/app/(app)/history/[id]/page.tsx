import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  findReplayPreviewForRuleName,
  getAlertRuleReplayPreviews,
  getReplayBadgeLabel,
} from "@/lib/alerts/replay";
import { getAlertRulesForCurrentUser } from "@/lib/alerts/rules";
import {
  getDeliveryLabel,
  getProofImageSrc,
  getSideLabel,
  getSignalRangeLabel,
  getTradePlanTiles,
  summarizeProof,
} from "@/lib/history/presentation";
import { getHistoryRecordById } from "@/lib/history/source";
import { cn } from "@/lib/utils";

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

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const history = await getHistoryRecordById(id);

  if (!history.item) {
    notFound();
  }

  const item = history.item;
  const proofImageSrc = getProofImageSrc(item.proof);
  const rules = await getAlertRulesForCurrentUser();
  const replayPreviews = await getAlertRuleReplayPreviews(rules);
  const replayPreview = findReplayPreviewForRuleName(rules, replayPreviews, item.ruleName);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Proof detail</Badge>
          <Badge variant={history.source === "supabase" ? "default" : "secondary"}>
            {getHistorySourceLabel(history.source)}
          </Badge>
        </div>
        <Link href="/history" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to history
        </Link>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={item.deliveryStatus === "delivered" ? "default" : "secondary"}>
              {getDeliveryLabel(item.deliveryStatus)}
            </Badge>
            <Badge variant="outline">{item.marketSymbol}</Badge>
            <Badge variant="outline">{item.timeframe}</Badge>
            {replayPreview ? (
              <Badge variant={replayPreview.status === "ready" ? "outline" : "secondary"}>
                {getReplayBadgeLabel(replayPreview)}
              </Badge>
            ) : null}
          </div>
          <CardTitle className="text-2xl">{summarizeProof(item)}</CardTitle>
          <CardDescription>{item.message}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-2xl border border-border bg-[#f7f1e6] p-4">
            <div className="mx-auto aspect-[3/4] w-full max-w-[360px] overflow-hidden rounded-xl bg-[#f4efe6]">
              {proofImageSrc ? (
                <img
                  alt={`${summarizeProof(item)} proof snapshot`}
                  className="h-full w-full object-contain"
                  height={item.proof.height}
                  src={proofImageSrc}
                  width={item.proof.width}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  Proof preview unavailable for this artifact type.
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm font-medium">Rule</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.ruleName}</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm font-medium">Signal side</p>
              <p className="mt-1 text-sm text-muted-foreground">{getSideLabel(item.side)}</p>
            </div>
            {item.tradePlan ? (
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-sm font-medium">Trade plan</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {getTradePlanTiles(item.tradePlan).map((tile) => (
                    <div
                      key={tile.label}
                      className="rounded-lg border border-border bg-[#f7f1e6] px-3 py-2"
                    >
                      <p className="text-xs text-muted-foreground">{tile.label}</p>
                      <p className="text-sm font-semibold">{tile.value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Signal range {getSignalRangeLabel(item.tradePlan)}
                </p>
              </div>
            ) : null}
            {replayPreview && replayPreview.metrics.length ? (
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-sm font-medium">Replay confidence</p>
                <p className="mt-1 text-sm text-muted-foreground">{replayPreview.detail}</p>
                <p className="mt-2 text-xs text-muted-foreground">{replayPreview.disclaimer}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {replayPreview.metrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-lg border border-border bg-[#f7f1e6] px-3 py-2"
                    >
                      <p className="text-xs text-muted-foreground">{metric.label}</p>
                      <p className="text-sm font-semibold">{metric.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm font-medium">Proof artifact</p>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {item.proof.mediaType} · {item.proof.width}x{item.proof.height}
              </p>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                Hash {item.proof.contentHash}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm font-medium">Recorded at</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {new Date(item.createdAt).toLocaleString("en-US", {
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  month: "short",
                  timeZone: "UTC",
                  timeZoneName: "short",
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
