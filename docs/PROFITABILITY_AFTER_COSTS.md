# Profitability After Trading Costs

## Why this document exists

On 2026-07-09 we pulled the first real, resolved-outcome sample for both
live rule types (97 resolved alerts: 66 `stacked_imbalance`, 31
`trapped_traders`) and found the track record looked healthy on paper:

- Gross: 55.7% win rate, average +0.25R, total +24R

But that number is the *gross* R-multiple — price movement only, with no
trading costs applied. When we modeled realistic Bybit round-trip costs
(taker fees + slippage) against the actual trade plans, the result flipped
hard negative:

| Scenario | Net avg R | Net total R | Net win rate |
| --- | --- | --- | --- |
| Gross (price only) | +0.25 | +24.0 | 55.7% |
| Optimistic (maker fees, low slippage) | -1.05 | -102 | 36% |
| Realistic (taker fees, Bybit perp) | -3.00 | -291 | 11% |
| Conservative (taker + wider slippage) | -4.30 | -417 | 3% |

## Root cause

The median stop distance across those 97 trades was **0.06% of entry
price** (min 0.007%, max 0.24%). Bybit round-trip taker fees alone are
~0.11% of notional — bigger than the median risk unit *before any slippage
is added*. A strategy whose stop is tighter than its own trading costs
cannot be net profitable no matter how good its win rate is, because costs
eat more than 1R on every single trade.

This wasn't a UI or reporting bug — the Track Record UI was accurately
reporting real gross R-multiples the whole time. The strategy design
itself (deriving stop distance purely from the confirmation candle
window's high/low on 1m timeframes) produced stops far too tight for real
execution.

## Fix applied

`engine/internal/evaluator/evaluator.go`'s `BuildTradePlan` now enforces a
minimum risk distance floor of **0.75% of entry price**
(`minimumViableRiskPercent`), applied unconditionally — not just as a
degenerate fallback when the candle-derived risk is zero or negative. When
the natural signal range produces a tighter stop, the floor overrides it;
wider, already-viable signal ranges are left untouched.

0.75% keeps realistic round-trip costs (~0.15%) to about a fifth of 1R,
leaving real edge for the strategy to work with instead of guaranteeing a
loss on every trade.

## What this changes going forward

- Alerts will now use wider stops (and proportionally wider TP1/TP2
  targets, since those are still risk-multiples of the stop distance).
  This will likely change win rate and trade frequency versus the tainted
  historical sample above — that's expected and needs to be re-measured.
- **The pre-fix historical sample (97 resolved alerts) is not a valid
  measure of this strategy's real-world viability** and should not be used
  to make monetization claims. Only alerts resolved after this fix should
  count toward a credible track record.
- Follow-up work (not yet done): add a net-of-fees R-multiple alongside
  gross R in the Track Record UI, so this kind of gap is visible by
  default instead of requiring an ad hoc analysis to catch.

## Reproducing the analysis

The analysis pulled `alert_history` rows via the Supabase Management API
and modeled cost-in-R as `(cost_pct / 100) * entry_price / risk_price` for
each resolved trade, using three fee/slippage scenarios (optimistic,
realistic, conservative) described above. No script was checked into the
repo; the numbers here are the durable record of that one-off analysis.
