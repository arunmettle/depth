import type {
  AlertRule,
  StackedImbalanceParams,
  SupportedMarket,
  SupportedTimeframe,
} from "@/lib/alerts/schema";

const BYBIT_RECENT_TRADES_URL = "https://api.bybit.com/v5/market/recent-trade";
const RECENT_TRADES_LIMIT = 1000;
const REPLAY_LOOKAHEAD_CANDLES = 3;

type ReplayTrade = {
  price: number;
  side: "Buy" | "Sell";
  size: number;
  timestamp: Date;
};

type ReplayCandle = {
  bucketStart: Date;
  buyVolume: number;
  close: number;
  high: number;
  low: number;
  open: number;
  sellVolume: number;
  totalVolume: number;
  trades: number;
};

type ReplaySignal = {
  bucketStart: Date;
  direction: "buy" | "sell";
  followThroughBps: number;
  oneCandleBps: number;
};

export type AlertReplayMetric = {
  label: string;
  value: string;
};

export type AlertReplayPreview = {
  detail: string;
  disclaimer: string;
  headline: string;
  metrics: AlertReplayMetric[];
  status: "insufficient" | "ready" | "unavailable" | "unsupported";
};

type BybitRecentTradesResponse = {
  result?: {
    list?: Array<{
      S?: string;
      T?: string;
      p?: string;
      v?: string;
    }>;
  };
  retCode?: number;
  retMsg?: string;
};

export function getReplayBadgeLabel(preview: AlertReplayPreview): string {
  if (preview.status === "unsupported" || preview.status === "unavailable") {
    return "Replay unavailable";
  }

  if (preview.status === "insufficient") {
    return "Replay: building sample";
  }

  const followThrough = preview.metrics.find((metric) => metric.label === "Follow-through");
  if (followThrough) {
    return `Replay: ${followThrough.value} follow-through`;
  }

  return "Replay: selective (no recent trigger)";
}

export function findReplayPreviewForRuleName(
  rules: AlertRule[],
  previews: Map<string, AlertReplayPreview>,
  ruleName: string
): AlertReplayPreview | undefined {
  const matchingRule = rules.find((rule) => rule.name === ruleName);
  if (!matchingRule) {
    return undefined;
  }

  return previews.get(matchingRule.id);
}

export async function getAlertRuleReplayPreviews(rules: AlertRule[]) {
  const previews = new Map<string, AlertReplayPreview>();
  const symbolTrades = new Map<SupportedMarket, ReplayTrade[] | null>();
  const symbols = new Set<SupportedMarket>();

  for (const rule of rules) {
    if (rule.ruleType === "stacked_imbalance") {
      symbols.add(rule.marketSymbol);
    }
  }

  await Promise.all(
    Array.from(symbols).map(async (symbol) => {
      const trades = await fetchRecentTrades(symbol);
      symbolTrades.set(symbol, trades);
    })
  );

  for (const rule of rules) {
    if (rule.ruleType !== "stacked_imbalance") {
      previews.set(rule.id, {
        detail:
          "Replay confidence is available for stacked imbalance first. Trapped traders stays disabled until we have a trustworthy historical absorption model.",
        disclaimer: "v1 confidence scope",
        headline: "Replay preview unavailable",
        metrics: [],
        status: "unsupported",
      });
      continue;
    }

    const trades = symbolTrades.get(rule.marketSymbol) ?? null;
    if (!trades) {
      previews.set(rule.id, {
        detail:
          "Recent Bybit trades could not be loaded right now, so this rule has no fresh confidence sample yet.",
        disclaimer: "network or exchange response unavailable",
        headline: "Replay sample unavailable",
        metrics: [],
        status: "unavailable",
      });
      continue;
    }

    previews.set(rule.id, buildReplayPreview(rule, trades));
  }

  return previews;
}

export function buildReplayPreview(rule: AlertRule, trades: ReplayTrade[]): AlertReplayPreview {
  if (rule.ruleType !== "stacked_imbalance") {
    return {
      detail:
        "Replay confidence is only supported for stacked imbalance in the current product slice.",
      disclaimer: "unsupported rule type",
      headline: "Replay preview unavailable",
      metrics: [],
      status: "unsupported",
    };
  }

  const params = rule.params as StackedImbalanceParams;
  const candles = buildReplayCandles(trades, rule.timeframe);
  const completedCandles = candles.length > 1 ? candles.slice(0, -1) : [];
  const minimumCandles = params.confirmationRows + 1;

  if (completedCandles.length < minimumCandles) {
    return {
      detail: `Need at least ${minimumCandles} completed ${rule.timeframe} candles to replay this rule. The recent exchange sample is still too short.`,
      disclaimer: "recent replay uses public trades only",
      headline: "Sample still building",
      metrics: [
        {
          label: "Completed candles",
          value: String(completedCandles.length),
        },
      ],
      status: "insufficient",
    };
  }

  const signals = findReplaySignals(completedCandles, params);
  const sampleWindow = describeSampleWindow(completedCandles, rule.timeframe);

  if (!signals.length) {
    return {
      detail: `No stacked imbalance trigger appeared in the recent ${sampleWindow} replay. That is useful too: this rule is currently selective rather than noisy.`,
      disclaimer: "gross move only, excludes fees and slippage",
      headline: "No recent trigger in sample",
      metrics: [
        {
          label: "Sample window",
          value: sampleWindow,
        },
        {
          label: "Completed candles",
          value: String(completedCandles.length),
        },
      ],
      status: "ready",
    };
  }

  const favorableSignals = signals.filter((signal) => signal.followThroughBps > 0);
  const averageMove = average(signals.map((signal) => signal.followThroughBps));
  const oneCandleFollowThrough = average(
    signals.map((signal) => (signal.oneCandleBps > 0 ? 100 : 0))
  );
  const latestSignal = signals[signals.length - 1];

  return {
    detail: `Recent replay found ${signals.length} trigger${signals.length === 1 ? "" : "s"} across ${sampleWindow}. ${favorableSignals.length} moved in the expected direction within the next ${REPLAY_LOOKAHEAD_CANDLES} candles.`,
    disclaimer:
      "recent replay only, based on public trades and close-to-close gross move, excluding fees, slippage, and execution constraints",
    headline: "Replay confidence preview",
    metrics: [
      {
        label: "Sample window",
        value: sampleWindow,
      },
      {
        label: "Signals",
        value: String(signals.length),
      },
      {
        label: "Follow-through",
        value: `${Math.round((favorableSignals.length / signals.length) * 100)}%`,
      },
      {
        label: `${REPLAY_LOOKAHEAD_CANDLES}-candle avg`,
        value: formatBps(averageMove),
      },
      {
        label: "1-candle follow-through",
        value: `${Math.round(oneCandleFollowThrough)}%`,
      },
      {
        label: "Latest trigger",
        value: `${latestSignal.direction.toUpperCase()} ${formatUtcTime(latestSignal.bucketStart)}`,
      },
    ],
    status: "ready",
  };
}

async function fetchRecentTrades(symbol: SupportedMarket) {
  const url = new URL(BYBIT_RECENT_TRADES_URL);
  url.searchParams.set("category", "linear");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("limit", String(RECENT_TRADES_LIMIT));

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as BybitRecentTradesResponse;
    if (payload.retCode !== 0 || !payload.result?.list?.length) {
      return null;
    }

    return payload.result.list
      .map((trade) => {
        if (!trade.p || !trade.v || !trade.S || !trade.T) {
          return null;
        }

        const price = Number(trade.p);
        const size = Number(trade.v);
        const timestamp = Number(trade.T);
        if (!Number.isFinite(price) || !Number.isFinite(size) || !Number.isFinite(timestamp)) {
          return null;
        }

        if (trade.S !== "Buy" && trade.S !== "Sell") {
          return null;
        }

        return {
          price,
          side: trade.S,
          size,
          timestamp: new Date(timestamp),
        } satisfies ReplayTrade;
      })
      .filter((trade): trade is ReplayTrade => trade !== null)
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  } catch {
    return null;
  }
}

function buildReplayCandles(trades: ReplayTrade[], timeframe: SupportedTimeframe) {
  const timeframeMs = timeframeToMilliseconds(timeframe);
  const candles = new Map<number, ReplayCandle>();

  for (const trade of trades) {
    const bucket = Math.floor(trade.timestamp.getTime() / timeframeMs) * timeframeMs;
    const existing = candles.get(bucket);

    if (!existing) {
      candles.set(bucket, {
        bucketStart: new Date(bucket),
        buyVolume: trade.side === "Buy" ? trade.size : 0,
        close: trade.price,
        high: trade.price,
        low: trade.price,
        open: trade.price,
        sellVolume: trade.side === "Sell" ? trade.size : 0,
        totalVolume: trade.size,
        trades: 1,
      });
      continue;
    }

    existing.close = trade.price;
    existing.high = Math.max(existing.high, trade.price);
    existing.low = Math.min(existing.low, trade.price);
    existing.totalVolume += trade.size;
    existing.trades += 1;

    if (trade.side === "Buy") {
      existing.buyVolume += trade.size;
    } else {
      existing.sellVolume += trade.size;
    }
  }

  return Array.from(candles.values()).sort(
    (left, right) => left.bucketStart.getTime() - right.bucketStart.getTime()
  );
}

function findReplaySignals(candles: ReplayCandle[], params: StackedImbalanceParams) {
  const signals: ReplaySignal[] = [];

  for (let index = params.confirmationRows - 1; index < candles.length - 1; index += 1) {
    const window = candles.slice(index - params.confirmationRows + 1, index + 1);
    const direction = detectStackedImbalance(window, params.thresholdMultiplier);
    if (!direction) {
      continue;
    }

    const current = candles[index];
    const next = candles[index + 1];
    const lookaheadIndex = Math.min(index + REPLAY_LOOKAHEAD_CANDLES, candles.length - 1);
    const lookahead = candles[lookaheadIndex];

    signals.push({
      bucketStart: current.bucketStart,
      direction,
      followThroughBps: directionalMoveBps(current.close, lookahead.close, direction),
      oneCandleBps: directionalMoveBps(current.close, next.close, direction),
    });
  }

  return signals;
}

function detectStackedImbalance(
  candles: ReplayCandle[],
  thresholdMultiplier: number
): "buy" | "sell" | null {
  let expectedDirection: "buy" | "sell" | null = null;

  for (const candle of candles) {
    const dominant = dominantSide(candle);
    if (!dominant) {
      return null;
    }

    if (dominant.ratio * 100 < thresholdMultiplier) {
      return null;
    }

    if (!expectedDirection) {
      expectedDirection = dominant.direction;
      continue;
    }

    if (expectedDirection !== dominant.direction) {
      return null;
    }
  }

  return expectedDirection;
}

function dominantSide(candle: ReplayCandle) {
  if (candle.buyVolume > candle.sellVolume) {
    return {
      direction: "buy" as const,
      ratio: imbalanceRatio(candle.buyVolume, candle.sellVolume),
    };
  }

  if (candle.sellVolume > candle.buyVolume) {
    return {
      direction: "sell" as const,
      ratio: imbalanceRatio(candle.sellVolume, candle.buyVolume),
    };
  }

  return null;
}

function imbalanceRatio(dominant: number, opposing: number) {
  if (dominant <= 0) {
    return 0;
  }

  if (opposing <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return dominant / opposing;
}

function directionalMoveBps(entry: number, exit: number, direction: "buy" | "sell") {
  if (entry <= 0 || exit <= 0) {
    return 0;
  }

  const rawReturn = direction === "buy" ? exit / entry - 1 : entry / exit - 1;
  return rawReturn * 10000;
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function timeframeToMilliseconds(timeframe: SupportedTimeframe) {
  switch (timeframe) {
    case "1m":
      return 60_000;
    case "5m":
      return 5 * 60_000;
    case "15m":
      return 15 * 60_000;
  }
}

function describeSampleWindow(candles: ReplayCandle[], timeframe: SupportedTimeframe) {
  if (!candles.length) {
    return timeframe;
  }

  const start = candles[0].bucketStart.getTime();
  const end = candles[candles.length - 1].bucketStart.getTime() + timeframeToMilliseconds(timeframe);
  const minutes = Math.max(1, Math.round((end - start) / 60_000));

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  }

  const days = hours / 24;
  return `${days.toFixed(days >= 10 ? 0 : 1)}d`;
}

function formatBps(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} bps`;
}

function formatUtcTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(value);
}
