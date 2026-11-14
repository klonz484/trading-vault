# Market Data Freshness and Provider Rights

Status: Development policy; no live-price release is approved.

## 1. Freshness measurement

Twelve Data documents that a time-series `datetime` identifies when a bar opened. The validator therefore measures freshness from the close boundary of the newest structurally valid, confirmed candle, not from the candle's opening timestamp.

A candle is eligible only when:
- Its structure and provenance pass validation.
- It is not marked provisional.
- Its expected close boundary has passed.

A forming candle remains in raw observations for diagnostics and replay, but cannot make the confirmed series appear fresher.

Twelve Data's published REST API latency guidance says completed candles typically appear about 0.3–2 minutes after close, depending on the instrument. This is provider guidance, not a Trading Vault calibration result. Do not turn it into an approved universal threshold.

## 2. Threshold policy

Freshness limits must be configured per instrument and timeframe using:

`TRADING_VAULT_MARKET_DATA_FRESHNESS_POLICY_JSON`

Example shape (illustrative only; do not copy thresholds without calibration):

`{"EURUSD":{"M15":<approved_seconds>},"XAUUSD":{"M15":<approved_seconds>}}`

The runtime resolver accepts only a positive integer for the exact instrument/timeframe requested. It does not reuse another instrument's or timeframe's threshold. A missing, malformed or unapproved entry leaves readiness DEGRADED.

Calibration evidence should include repeated observations of:
- Candle close boundary and first time the provider exposes the completed candle.
- Instrument and timeframe.
- Market/session state and weekend/holiday transitions.
- Retrieval time and observed provider delay.
- Late corrections, missing bars, and temporary provider outages.

Use observed distributions (including high-percentile delay and outliers), not a single successful request. Calibrate forex pairs and XAUUSD separately, and calibrate each timeframe separately. Keep the release gate closed until the policy is reviewed and approved.

## 3. Provider timestamp considerations

Twelve Data documents that the `timezone` parameter applies to intraday intervals shorter than one day and is ignored for daily/weekly/monthly intervals. Its documentation also describes forex and cryptocurrency bar timestamps as UTC. Before certifying D1/W1 feeds—especially XAUUSD—verify the returned timestamp semantics against provider examples and actual response metadata. Do not infer a timezone from the server's local timezone.

## 4. Twelve Data rights and release gates

The current Twelve Data support policy states:
- Individual plans are for personal/internal use and do not permit redistribution or commercial display to third parties.
- Business plans can permit commercial display, subject to exchange licensing requirements.
- Commercial use of price data for regions outside the United States requires additional approval.
- Redistribution requires a separate agreement.
- Derived data may be permitted when it cannot be reverse-engineered to reconstruct source prices; public derived-data display has attribution requirements.

The Terms of Use separately require external display/redistribution rights to be expressly permitted by the subscription tier, add-on or written agreement, and note that third-party data can have additional licensing and fee requirements.

Before enabling any user-facing prices, obtain written confirmation covering:
1. The actual subscription tier and account holder.
2. EURUSD, other intended forex pairs, and XAUUSD specifically.
3. South African access and display, plus any other countries where users may be located.
4. A server-side provider account feeding a multi-user Trading Vault application.
5. Raw OHLC display versus derived indicators, scores, setups and AI analysis.
6. API access, caching/retention duration, historical replay, exports, and attribution.
7. Any exchange fees, add-ons, redistribution agreement or professional-user requirements.

Until then, keep entitlement and licence states UNVERIFIED. A successful API response does not grant display or redistribution rights.

## 5. Release rule

Raw prices may be returned only when all of the following are true:
- An exact instrument/timeframe freshness policy is configured and passes.
- The latest analytical candles are confirmed and chronologically valid.
- Provider account entitlement is verified.
- Display, caching and redistribution rights are verified for the intended user geography and product model.

Development diagnostics and replay may continue without releasing prices. Production and multi-user price display remain disabled until the evidence above is complete.
