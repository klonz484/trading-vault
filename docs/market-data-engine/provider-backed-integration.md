# Provider-backed Market Data integration

**Development branch:** `build/market-data-brain-ready-v1`  
**Status:** On-demand integration and monitoring surface; not a production release.

## What is connected

- `GET /api/market-data` performs an authenticated, owner-only, on-demand Twelve Data OHLC request.
- `/market-data` provides a manual diagnostic screen for EURUSD and XAUUSD across M1, M5, M15, M30, H1, H4, D1 and W1.
- The API sends the resulting normalized snapshot through `createMarketDataBrainHandoff`, which uses the provenance-preserving adapter and the independent Brain assessment boundary.
- The response reports provider response, data-quality state, the Brain market-data gate, provenance references and limitations. It returns OHLC values only when every existing price-release gate passes.
- Requests are rate-limited and use `cache: no-store`; the page does not poll automatically.

## Provider capability boundary

Twelve Data is the current intraday OHLC candle provider.

The Alpha Vantage helper currently implements `CURRENCY_EXCHANGE_RATE` for mapped fiat currency pairs only. It is a reference-rate observation, not a candle series, not a gold feed, and not a substitute for Twelve Data OHLC history. Do not blend it into the candle pipeline or present it as a second validated candle provider.

## Server environment

Configure secrets only in the server environment (for example, Vercel Environment Variables or an untracked local `.env.local`). Never put provider keys in browser code, client-visible environment variables, Git, screenshots, or chat.

| Variable | Purpose |
| --- | --- |
| `TWELVE_DATA_API_KEY` | Required for the current OHLC provider request. |
| `TRADING_VAULT_OWNER_USER_ID` | Required owner UUID used by the authenticated API route. |
| `TRADING_VAULT_MARKET_DATA_MAX_AGE_SECONDS` | Positive, owner-calibrated freshness threshold. If absent, validation remains DEGRADED and prices stay withheld. |
| `TRADING_VAULT_MARKET_DATA_ENTITLEMENT_VERIFIED` | Keep unset/false until the actual provider account entitlement is checked for the intended instruments and use. |
| `TRADING_VAULT_MARKET_DATA_LICENSE_VERIFIED` | Keep unset/false until display, storage, redistribution and multi-user rights are confirmed for the actual plan. |
| `ALPHA_VANTAGE_API_KEY` | Optional for the separate fiat reference-rate helper; not required by the current candle route. |

Do not set either verification flag to true merely to make prices appear. They are owner attestations that must be supported by the provider plan and licence terms. Do not guess a freshness threshold; calibrate it by instrument and timeframe before enabling any release gate.

## Status semantics

- `NOT_CONFIGURED`: server credential is absent.
- `READY`: the existing price-release checks passed.
- `DEGRADED`: observations may be structurally valid, but a required calibration such as freshness is absent.
- `STALE`, `INCOMPLETE`, `CONFLICTED` or `UNAVAILABLE`: evidence does not meet data-quality requirements.
- Brain `LIVE_ELIGIBLE`: market-data evidence passed the adapter's data gate only. It is not a directional assessment or a trading signal.
- Brain `INSUFFICIENT_EVIDENCE`: expected until the formal methodology and independent structure / multi-timeframe validators are implemented and verified.

## Test procedure

1. Sign in with the configured owner account in the development application.
2. Open `/market-data`.
3. Select EURUSD or XAUUSD and one timeframe.
4. Press **Check live feed** once and wait for the response. The API enforces a shared rate limit.
5. Inspect provider response, observation counts, latest candle timestamp, validation warnings/errors, entitlement/licence state and Brain handoff gate.
6. Repeat with the other instrument and relevant timeframes only after the first request has completed.
7. Compare timestamps and candle structure against an independently permitted source before treating any observation as trustworthy.

## Safety and current limitations

- No background polling, provider failover, persistence, or automatic provider blending is enabled by this diagnostic page.
- The Twelve Data provisional-candle flag is currently estimated from interval boundaries. It is not a verified historical `availableAt` contract; do not feed it to the availability-aware multi-timeframe selector as certified close-time evidence.
- Price values remain withheld unless entitlement, licence and calibrated freshness checks pass.
- The Brain handoff is an evidence-readiness check. The current Brain remains non-directional and returns `INSUFFICIENT_EVIDENCE`.
- The Scanner remains an independent image-analysis workflow; this integration does not silently replace Scanner evidence with provider candles.
- MT5 LocalQueue remains local and is not connected to this API. No collector settings, broker transmission, order execution, production deployment, merge or paid infrastructure changes are included.
