# Trading Vault — Market Data Engine Foundation v0.1

This package is the first modular code foundation for the approved Market Data Engine architecture. It is designed to be extracted into the root of the existing `trading-vault` repository.

## Included

- Canonical registry for EURUSD, XAUUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD and NZDUSD.
- Twelve Data REST time-series adapter.
- Alpha Vantage fiat-FX reference-rate adapter.
- UTC-normalized timestamps with original source timestamp and timezone provenance.
- OHLC, positive-price, volume, ordering, duplicate, future-time and interval-gap validation.
- Explicit provisional candle state; no silent claim that every provider candle is closed.
- Raw provider observations separated from the fail-closed analytically eligible candle collection.
- Structured provider errors for malformed payloads, timeouts, quota limits and entitlement restrictions.
- Versioned snapshot metadata and explicit unverified licence/entitlement status.
- Independent provider close comparison with caller-supplied thresholds; conflicts are preserved, never averaged.
- A provider-agnostic service entry point and deterministic regression tests.

## Validation and tests

Run the local regression suite with:

```bash
npm test
```

The suite uses Node’s built-in test runner and the project TypeScript compiler; it does not require live provider credentials or network access. The current conflict helper compares matching confirmed UTC candle closes only and requires an instrument-calibrated threshold supplied by its caller.

The current snapshot version is an in-memory evidence identifier, not durable version history. Raw observations and correction history are not persisted. Provider entitlement and licence status remain `UNVERIFIED` until independently checked.

## Deliberately not activated

This is not production-ready and does not yet include:
- Next.js API routes or UI wiring.
- Supabase persistence, migrations, cache, or durable queues.
- Background polling or automatic provider fallback.
- Calibrated numerical thresholds or production confidence scoring.
- Licensing verification or account-entitlement certification.
- Broker-specific MT5 specifications or executable bid/ask feeds.
- Automated trade execution.

Those items require evidence and separate implementation/test gates from the approved 200-decision specification.

## Environment

Add credentials only to the server-side `.env.local` file. Never use `NEXT_PUBLIC_` prefixes for provider keys.

```env
TWELVE_DATA_API_KEY=your_key_here
ALPHA_VANTAGE_API_KEY=your_key_here
```

Do not commit `.env.local`, paste keys into chat, or include real keys in ZIP files.

## Usage from server-side code

```ts
import { getTwelveDataSnapshot } from "@/lib/market-data";

const snapshot = await getTwelveDataSnapshot("EURUSD", "M15", {
  outputsize: 100,
  // Supply only after instrument-specific calibration and owner approval:
  // maxAgeSeconds: 120,
});
```

Without an approved freshness threshold, the validator returns `DEGRADED`, not `READY`.

## Provider boundaries

- Twelve Data is the primary candidate, subject to the actual account's instrument, endpoint, quota and licensing entitlements.
- Alpha Vantage is implemented only as an optional fiat-FX reference-rate source here. It is not used as an intraday fallback.
- XAUUSD is mapped to `XAU/USD` for Twelve Data lookup, but account entitlement and data licence still require verification.
- No prices are averaged or blended across providers.
- No quote is treated as executable broker pricing.

## Next integration gates

1. Extract and inspect this package in the existing Codespace.
2. Run lint and build checks.
3. Add the server-side API boundary with authentication and rate limiting.
4. Design and review the Supabase persistence schema and RLS policies.
5. Validate actual provider responses, account entitlements and licences.
6. Calibrate freshness, discrepancy and anomaly thresholds using observed data.
7. Add durable queues, caching, monitoring and recovery.
8. Integrate Scanner and Brain through versioned evidence contracts.
9. Complete security, isolation, replay and failure tests.
10. Obtain explicit owner technical-readiness approval.
