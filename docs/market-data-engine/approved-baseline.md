# Approved Market Data Engine Baseline

**Decision register:** 1–200 approved Option C.  
**Approval scope:** Architecture and planning requirements only.  
**Implementation status:** Foundation package only; production readiness not established.

## Architecture

- Hybrid, provider-independent market data service.
- Separate provider feeds, independently validated and compared.
- Initial focus: EURUSD and XAUUSD.
- Planned coverage: EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD and XAUUSD.
- Planned timeframes: M1, M5, M15, M30, H1, H4, D1 and W1.
- UTC storage with original source timestamps and timezone metadata.
- Server-side secrets; no provider key in browser code.
- Central validated data packages for independent Scanner and Brain pipelines.
- Manual MT5 execution only; no automatic order placement or modification.

## Data integrity

- Preserve source observations and provenance.
- Validate OHLC relationships, timestamps, ordering, duplicates, missing periods and provider corrections.
- Keep provisional forming-candle evidence distinct from confirmed closed-candle evidence.
- Preserve conflicting provider observations; never silently average or overwrite them.
- Maintain versioned snapshots, replay and correction history.
- Distinguish data confidence from analytical confidence.

## Readiness

The engine must support READY, DEGRADED, STALE, INCOMPLETE, CONFLICTED and UNAVAILABLE states. A readiness state must restrict downstream analytical claims where evidence is unsuitable.

## Providers

- Twelve Data: primary candidate, subject to account entitlement and licence verification.
- Alpha Vantage: reference/daily historical use only where the actual account and endpoint support it; premium-only intraday FX is not assumed to be free.
- MT5 broker feed: future read-only comparison after broker-specific validation.

## Governance and safety

- No automatic paid upgrades.
- No production activation without capability, quality, licence and security checks.
- No cross-user sharing of private scans, strategies, journals or personal analysis.
- Shared Core Brain changes require controlled experiments and owner approval.
- Production readiness requires evidence, gap closure and explicit owner sign-off.
