# MT5 Development validation status — 2026-11-13

## Automated verification

The following GitHub Actions runs completed successfully for the current Development work:

- RCG isolated branch checks: run 30, commit `54b834f3c4d8afc01c88340c3fe24bb2c49c8122`.
  - Repository tests passed.
  - ESLint passed.
  - TypeScript type-check passed.
- Trading Vault checks: run 157, same commit.
  - Dependency installation, ESLint and Next.js production build passed.
- Trading Vault quality gates: run 466, same commit.
  - Locked dependency installation, ESLint, complete automated tests and production build passed.
- Market-data Development commit `4f48ec845f2d853d48ab053289298f57e085d53a`:
  - Trading Vault quality gates passed.
  - Dedicated MT5 uploader checks passed.
  - Trading Vault checks passed.
  - Vercel reported a successful Preview deployment check for this commit.

## What these checks do not prove

CI does not compile MQL5 source in MetaEditor and does not connect to the user's RCG MT5 terminal. The collector still requires:

1. MetaEditor compilation on the user's MT5 installation, with zero errors and warnings.
2. A supervised, local-only demo run to verify queue creation, tick pagination, duplicate handling and cursor commit behavior.
3. Inspection of the resulting local logs and queue files without transmitting them.

The timestamp-domain issue remains an independent hard blocker. Native MT5 tick/candle timestamps must not be treated as UTC until the RCG server's timestamp basis and historical UTC/DST schedule are verified. The API future-time guard must not be weakened to accommodate ambiguous timestamps.

## Current operational boundary

- Both changes remain in Development pull requests; neither is merged into `main`.
- Production has not been changed.
- No MT5 terminal configuration, EA inputs, queue files or cursor values were changed by these CI checks.
- No collector credential has been issued and no MT5 data has been transmitted.
- The local uploader remains dry-run by default; real transmission and queue archiving remain disabled pending isolated Preview storage validation and explicit supervised-test approval.

## Next acceptance gates

1. Review and validate the isolated non-production storage path before applying any database migration.
2. Complete MetaEditor compilation and supervised local-only collector validation.
3. Obtain authoritative RCG timestamp/timezone confirmation and capture paired broker/UTC clock evidence.
4. Implement and test a versioned timestamp contract that preserves raw broker time and conversion provenance.
5. Only after the above gates pass, plan a synthetic Preview ingestion test. Real broker-data transmission remains separately gated.
