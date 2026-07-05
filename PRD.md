# Product Requirement Document (PRD)

## Project Name: Sentinel Flow (Working Title)
**Author:** Product Engineering Team  
**Date:** July 2026  
**Status:** Draft  
**Target Audience:** Active Order Flow, Footprint, and Volume Profile Traders (Crypto Perpetuals & Legacy Futures)

---

## 1. Executive Summary & Value Proposition
Standard trading alert tools are fundamentally broken for advanced order flow traders. They either track generic macro price levels or fire raw text alerts (e.g., "BTC RSI Overbought") that fail to communicate the structural reality of the order book. Advanced traders are forced to sit in front of multi-monitor setups running heavy, expensive desktop software (e.g., Sierra Chart, Bookmap) for 8–12 hours a day just waiting for highly specific footprint cluster patterns to form.

**Sentinel Flow** is a high-performance, backend-driven micro-SaaS that acts as the trader’s remote eyes. It ingests live, tick-by-tick transaction data directly from exchange WebSockets, aggregates execution imbalances in-memory, and broadcasts rich, visually verified alerts directly to **Telegram** or a sleek **Web App Portal**. 

Instead of forcing users to return to their desks to validate an alert, Sentinel Flow builds a **"Visual Proof Engine"** that dynamically renders the exact footprint cluster, delta layout, and trapped volume configurations directly into the notification graphic or web dashboard.

---

## 2. Core Problem & Market Opportunity
1. **Screen Captivity:** Order flow traders suffer from intense screen fatigue and missed-opportunity anxiety (FOMO). They cannot walk away from their desks because footprints require real-time visual verification.
2. **Technical Friction:** Creating custom order flow alert triggers requires deep scripting knowledge (e.g., Pine Script optimizations, C++ modules) and heavy local data processing infrastructure that retail traders cannot scale.
3. **High Capital At Risk:** Prop-firm (funded) and private account traders frequently blow accounts during emotional "tilt" or due to execution errors during massive delta shifts. They need rapid, contextual data to make split-second risk adjustments.

---

## 3. The Winning Product Setup (Retention & Monetization Moat)
To optimize user retention and command premium SaaS pricing, the product architecture splits value into three distinct tiers:

### A. The Instant Telegram Pipeline (Frictionless Ingestion)
Traders configure highly specific alert presets (e.g., "Bitcoin 5m Stacked Buying Imbalance > 300%"). The alert lands in Telegram within milliseconds of candle close, carrying a dynamically generated graphic showing the exact price ladder.

### B. The Web-App Portal & Snapshot Player (Deep Engagement)
When a user clicks the Telegram alert link, it securely opens the Sentinel Flow Web App. Instead of loading an infinitely scrolling, resource-heavy live chart, the web app opens a **Compact Snapshot Component**. This component renders the historical context (e.g., the last 12 candles surrounding the event) as a crisp footprint ladder, allowing the user to scrub back and forth through execution blocks without lagging their mobile browser.

### C. The Alpha Features (The Retention Lock-In)
* **Prop-Firm Safety Engine:** Users optionally hook up a read-only exchange API key. Sentinel Flow tracks cumulative volume trends against the trader’s absolute position exposure, warning them via high-priority Telegram pings if market absorption is turning against their open size.
* **Community Alpha Streaming:** Multi-user licensing allowing Telegram channel owners and trading alpha groups to broadcast Sentinel Flow visuals directly into their premium community feeds.

---

## 4. Functional Specifications

### User Flow 1: Registration & Telegram Integration
1. User logs into the Web App via an OAuth provider (e.g., Discord, Google) or standard Magic Link.
2. The user navigates to the Settings panel and clicks "Connect Telegram Bot".
3. The platform provides a unique deep-link token (`t.me/SentinelFlowBot?start=XYZ123`).
4. Upon clicking, the Telegram bot activates, welcomes the user, and securely pairs their platform account profile with their active Telegram Chat ID.

### User Flow 2: Custom Alert Configuration (Web UI)
1. The user creates an alert template by choosing an asset pair (e.g., `BYBIT:BTCUSDT`, `BYBIT:SOLUSDT`).
2. They select their structural timeframe (1m, 5m, 15m, 1H).
3. They toggle specific Order Flow Triggers:
   * **Stacked Imbalance:** Toggle threshold multiplier (Default: 300% volume variance across 3 consecutive rows).
   * **Exhaustion Block:** Minimal volume at extreme candle wicks with inverse delta flips.
   * **Trapped Buyers/Sellers:** Absorption cluster limits exceeding user-defined volume blocks ($V > X$).
4. The user maps the alert destination to their Connected Telegram Account or a specific Web-hook room.

### User Flow 3: Alert Ingestion & The Visual Proof Loop
1. The exchange WebSocket fires tick events (Price, Size, Taker Side) into the Sentinel Flow ingestion worker.
2. The ingestion worker chunks the logs into granular price rows in-memory (RAM).
3. At candle close, the calculation layer verifies if criteria are satisfied.
4. If a match occurs, the **Visual Proof Engine** compiles the localized metrics, injects the properties into an SVG text block, flattens it to a lightweight PNG buffer, and ships it instantly to the Telegram Bot API and updates the Web App Database state.

---

## 5. Technical Architecture & Data Strategy

```
[ Bybit Public WebSockets ] 
          │
          ▼
[ Backend Ingestion Worker ] ──(In-Memory Cache: Redis / RAM)
          │
          ▼
[ Pattern Evaluation Engine ] 
          │
          ├──────────────────────────────┐
          ▼                              ▼
[ SVG Matrix Graphic Engine ]  [ Database State Logger (PostgreSQL) ]
          │                              │
          ▼                              ▼
[ Telegram Bot API Worker ]    [ NextJS/Nuxt Web App (Snapshot View) ]
```

### High-Performance Backend (The Core Engine)
* **Stack Recommendation:** Go, Rust, or optimized .NET Core to seamlessly process tens of thousands of tick metrics per second during peak market volatility without throttling.
* **State Operations:** Live tick streams must execute calculations purely within RAM arrays or a dedicated local Redis cache instance. Disk write operations (PostgreSQL/Supabase) are isolated *only* to logging historical alerts, account credentials, and platform preferences.
* **Graphic Generation Pipeline:** The backend maps matching candle matrix data to native structural SVG templates. The SVG string renders to a sharp PNG format via a fast system buffer wrapper (e.g., `libvips` / `Sharp` / `SkiaSharp`), ensuring near-zero processing overhead.

### Lightweight Web Application Frontend
* **Stack Recommendation:** Next.js, Nuxt, or SvelteKit deployed onto an edge-routing network (Vercel/Hetzner/DigitalOcean).
* **Footprint Presentation Component:** To bypass the complex overhead of canvas-heavy web utilities, the web portal renders footprints via structured HTML/CSS tables styled with micro-opacity heatmaps, keeping components completely responsive on mobile viewports.

---

## 6. Monetization Strategy & Pricing Matrix

Sentinel Flow operates on a transparent value-driven B2B/Prosumer subscription framework. Traders are highly price-resilient if software directly protects their active daily drawdown.

| Subscription Tier | Pricing (Monthly) | Target Audience | Features Included |
| :--- | :--- | :--- | :--- |
| **Tier 1: Scout** | \$29 / USD | Casual Day Traders | 2 Active Alert Rules, Major Pairs Only (BTC/ETH), Core Footprint Layouts, Standard Telegram Pings. |
| **Tier 2: Sentinel Pro** | \$59 / USD | Dedicated Scaling Traders | Unlimited Alert Rules, All Crypto Pairs + Major Commodities (Gold/Silver Data Wrappers), Custom Web App Dashboard Access, Interactive Historical Snapshots, Priority 1-Sec Delivery. |
| **Tier 3: Alpha Stream** | \$149+ / USD | Community Lead / Discord Group Owners | Multi-User Webhook Integration rights, White-Labeled Custom Watermarks for charts, Broadcast permission to channels, API data output exports. |

---

## 7. Key Product Metrics (KPIs for Growth)
1. **Alert Latency:** The absolute timeline between a candlestick closing on-exchange and the visual image message delivering onto the user's phone screen. Target: `< 1500ms`.
2. **Alert Activation Retention:** Percentage of subscribers who actively click the web app link from a Telegram message to evaluate historical context. Target: `> 65%`.
3. **Monthly Active Subscription Churn:** Active trader subscription drop-offs. Target: `< 4.5%` per month (Highly minimized by offering explicit utility that safeguards their account capital).
