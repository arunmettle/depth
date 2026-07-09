import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchBacktestRuns } from "@/lib/backtest/records";

export const revalidate = 300;

const MINIMUM_TRUSTWORTHY_SAMPLE_SIZE = 30;

function formatSignedR(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}R`;
}

function formatWinRate(winRate: number) {
  return `${(winRate * 100).toFixed(1)}%`;
}

function formatRuleType(ruleType: string) {
  return ruleType === "trapped_traders" ? "Trapped traders" : "Stacked imbalance";
}

export default async function BacktestPage() {
  const runs = await fetchBacktestRuns();

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
        <div className="flex items-center justify-between gap-4">
          <BrandMark />
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            Back home
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <Badge className="w-fit" variant="secondary">
            Real historical replay, not a live-preview approximation
          </Badge>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Historical backtest results
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Every row below comes from replaying real Bybit tick-by-tick
            trade history through the exact same rule-evaluation and
            outcome-resolution code the live engine uses - not a
            reimplemented approximation, and not the narrow &quot;last
            ~1,000 live trades&quot; preview shown elsewhere in the app.
            Net R already includes a realistic 0.15% round-trip trading
            cost.
          </p>
        </div>

        {runs.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No backtest runs recorded yet</CardTitle>
              <CardDescription>
                Historical backtests are run offline and published here once
                complete. Check back soon.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {runs.map((run) => {
              const belowSampleThreshold =
                run.resolved < MINIMUM_TRUSTWORTHY_SAMPLE_SIZE;

              return (
                <Card key={run.id}>
                  <CardHeader className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-lg">
                        {run.symbol} · {run.timeframe} ·{" "}
                        {formatRuleType(run.ruleType)}
                      </CardTitle>
                      <Badge variant="outline">
                        {run.periodStart} → {run.periodEnd}
                      </Badge>
                    </div>
                    <CardDescription>
                      {run.totalTradesReplayed.toLocaleString()} real trades
                      replayed · {run.totalSignals} signals generated
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {belowSampleThreshold ? (
                      <Badge variant="secondary" className="mb-3 w-fit">
                        Still a small sample ({run.resolved} resolved) - not
                        yet enough to trust as an edge estimate
                      </Badge>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border border-border px-3 py-2">
                        <div className="text-xs text-muted-foreground">
                          Win rate
                        </div>
                        <div className="text-lg font-semibold">
                          {formatWinRate(run.winRate)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {run.wins}W / {run.losses}L
                        </div>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2">
                        <div className="text-xs text-muted-foreground">
                          Gross avg R
                        </div>
                        <div className="text-lg font-semibold">
                          {formatSignedR(run.grossAvgR)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2">
                        <div className="text-xs text-muted-foreground">
                          Net avg R (after costs)
                        </div>
                        <div className="text-lg font-semibold">
                          {formatSignedR(run.netAvgR)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2">
                        <div className="text-xs text-muted-foreground">
                          Net total R
                        </div>
                        <div className="text-lg font-semibold">
                          {formatSignedR(run.netTotalR)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {run.expired} expired without a clear outcome within
                      the resolution window.
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
