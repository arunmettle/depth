import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { summarizeTrackRecord, summarizeTrackRecordByRuleType } from "@/lib/history/track-record";
import type { AlertRecord } from "@/lib/history/schema";

type TrackRecordCardProps = {
  items: AlertRecord[];
};

const RULE_TYPE_LABELS: Record<AlertRecord["ruleType"], string> = {
  stacked_imbalance: "Stacked imbalance",
  trapped_traders: "Trapped traders",
};

function formatSignedR(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}R`;
}

function buildSparklinePath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return `M0,${height / 2} L${width},${height / 2}`;
  }

  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function TrackRecordCard({ items }: TrackRecordCardProps) {
  const summary = summarizeTrackRecord(items);
  const byRuleType = summarizeTrackRecordByRuleType(items);
  const curveValues = summary.equityCurve.map((point) => point.cumulativeR);
  const path = buildSparklinePath(curveValues, 280, 72);
  const hasResolvedAlerts = summary.resolvedCount > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Real price outcomes</Badge>
          <Badge variant={hasResolvedAlerts ? "default" : "secondary"}>
            {summary.resolvedCount} resolved
          </Badge>
        </div>
        <CardTitle>Track record</CardTitle>
        <CardDescription>
          Whether each alert&apos;s stop-loss or take-profit level was actually touched
          afterward, checked against real Bybit historical price data - not a simulation
          or an estimate.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">Win rate</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {summary.winRatePercent === null ? "—" : `${summary.winRatePercent.toFixed(0)}%`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.wins} hit a take-profit, {summary.losses} stopped out
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">Average R-multiple</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {summary.averageRMultiple === null ? "—" : formatSignedR(summary.averageRMultiple)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Per resolved alert</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">Still tracking</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{summary.pendingCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.expiredCount} expired with no clear outcome
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">Cumulative R</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {formatSignedR(summary.totalRMultiple)}
          </p>
          {path ? (
            <svg
              className="mt-2 h-10 w-full"
              preserveAspectRatio="none"
              viewBox="0 0 280 72"
              role="img"
              aria-label="Cumulative R-multiple over time"
            >
              <path
                d={path}
                fill="none"
                stroke={summary.totalRMultiple >= 0 ? "#16a34a" : "#dc2626"}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No resolved alerts yet.</p>
          )}
        </div>
      </CardContent>
      {byRuleType.length > 1 ? (
        <CardContent className="grid gap-3 border-t border-border pt-6 md:grid-cols-2">
          {byRuleType.map(({ ruleType, summary: ruleSummary }) => (
            <div key={ruleType} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{RULE_TYPE_LABELS[ruleType]}</p>
                <Badge variant={ruleSummary.resolvedCount > 0 ? "default" : "secondary"}>
                  {ruleSummary.resolvedCount} resolved
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Win rate</p>
                  <p className="text-lg font-semibold tracking-tight">
                    {ruleSummary.winRatePercent === null
                      ? "—"
                      : `${ruleSummary.winRatePercent.toFixed(0)}%`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg R</p>
                  <p className="text-lg font-semibold tracking-tight">
                    {ruleSummary.averageRMultiple === null
                      ? "—"
                      : formatSignedR(ruleSummary.averageRMultiple)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cumulative R</p>
                  <p className="text-lg font-semibold tracking-tight">
                    {formatSignedR(ruleSummary.totalRMultiple)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
