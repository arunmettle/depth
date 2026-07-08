import type { AlertRecord } from "@/lib/history/schema";

const sampleProof = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960" role="img" aria-label="Sentinel Flow proof snapshot"><rect width="100%" height="100%" fill="#f4efe6"/><rect x="32" y="32" width="656" height="896" rx="28" fill="#fffaf2" stroke="#d9cdb8" stroke-width="2"/><text x="56" y="84" font-family="'Segoe UI', Arial, sans-serif" font-size="18" fill="#766956">Sentinel Flow Proof</text><text x="56" y="132" font-family="'Segoe UI', Arial, sans-serif" font-size="34" font-weight="700" fill="#1f1a14">BTCUSDT BUY 1m</text><rect x="56" y="156" width="152" height="34" rx="17" fill="#138a5b"/><text x="132" y="178" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="700" fill="#fff">BUY IMBALANCE</text><text x="56" y="222" font-family="'Segoe UI', Arial, sans-serif" font-size="18" fill="#50473d">BTCUSDT 1m buy stacked imbalance confirmed across 3 candles at 300% threshold.</text></svg>`;

export const mockHistoryItems: AlertRecord[] = [
  {
    createdAt: "2026-07-05T06:02:00Z",
    deliveryStatus: "delivered",
    id: "alert-1",
    marketSymbol: "BTCUSDT",
    message:
      "BTCUSDT 1m buy stacked imbalance confirmed across 3 candles at 300% threshold.",
    proof: {
      content: sampleProof,
      contentHash: "proof-btc-1",
      height: 960,
      mediaType: "image/svg+xml",
      width: 720,
    },
    ruleName: "BTC 1m stacked imbalance",
    ruleType: "stacked_imbalance",
    side: "buy",
    timeframe: "1m",
    outcome: {
      status: "tp1_hit",
      hitPrice: 64380.75,
      hitAt: "2026-07-05T06:41:00Z",
      rMultiple: 1,
      checkedAt: "2026-07-05T06:45:00Z",
    },
    tradePlan: {
      entryPrice: 64250.5,
      riskReward1: 1,
      riskReward2: 2,
      signalHigh: 64310,
      signalLow: 64180,
      stopLoss: 64120.25,
      takeProfit1: 64380.75,
      takeProfit2: 64511,
      triggerPrice: 64250.5,
    },
  },
  {
    createdAt: "2026-07-05T06:15:00Z",
    deliveryStatus: "queued",
    id: "alert-2",
    marketSymbol: "ETHUSDT",
    message:
      "ETHUSDT 5m sell stacked imbalance confirmed across 3 candles at 300% threshold.",
    proof: {
      content: sampleProof.replace("BTCUSDT BUY 1m", "ETHUSDT SELL 5m").replace(
        "#138a5b",
        "#b64242"
      ),
      contentHash: "proof-eth-1",
      height: 960,
      mediaType: "image/svg+xml",
      width: 720,
    },
    ruleName: "ETH 5m stacked imbalance",
    ruleType: "stacked_imbalance",
    side: "sell",
    timeframe: "5m",
    outcome: {
      status: "pending",
    },
    tradePlan: {
      entryPrice: 3420.15,
      riskReward1: 1,
      riskReward2: 2,
      signalHigh: 3428,
      signalLow: 3402,
      stopLoss: 3438.4,
      takeProfit1: 3401.9,
      takeProfit2: 3383.65,
      triggerPrice: 3420.15,
    },
  },
  {
    createdAt: "2026-07-05T06:28:00Z",
    deliveryStatus: "delivered",
    id: "alert-3",
    marketSymbol: "BTCUSDT",
    message:
      "BTCUSDT 1m trapped buyers confirmed: failed breakout round-tripped through the prior candle on at least 250000 notional.",
    proof: {
      content: sampleProof.replace("BTCUSDT BUY 1m", "BTCUSDT SELL 1m").replace(
        "#138a5b",
        "#b64242"
      ),
      contentHash: "proof-btc-2",
      height: 960,
      mediaType: "image/svg+xml",
      width: 720,
    },
    ruleName: "BTC 1m trapped traders",
    ruleType: "trapped_traders",
    side: "sell",
    timeframe: "1m",
    outcome: {
      status: "stop_hit",
      hitPrice: 64560.2,
      hitAt: "2026-07-05T06:52:00Z",
      rMultiple: -1,
      checkedAt: "2026-07-05T06:55:00Z",
    },
    tradePlan: {
      entryPrice: 64420.1,
      riskReward1: 1,
      riskReward2: 2,
      signalHigh: 64500,
      signalLow: 64350,
      stopLoss: 64570.1,
      takeProfit1: 64270.1,
      takeProfit2: 64120.1,
      triggerPrice: 64420.1,
    },
  },
];
