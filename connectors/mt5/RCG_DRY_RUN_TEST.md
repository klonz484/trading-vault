# RCG collector dry-run test procedure

## Purpose

Validate the local MT5 environment and broker symbol mapping before implementing or enabling any outbound market-data transport.

## Preconditions

- MT5 build 6257 is installed and opens on Debian 13 x86-64.
- The RCG demo account is connected.
- The production ingestion service is not yet deployed.
- No connector token is required for this dry-run.
- Keep the EA input `InpDryRunOnly=true`.

## Installation (only after source review)

1. In MT5 choose **File → Open Data Folder**.
2. Open `MQL5/Experts`.
3. Create a new folder named `TradingVault`; do not change existing EA files.
4. Copy `TradingVault_RCG_Collector.mq5` into that folder.
5. In MT5 Navigator, right-click **Expert Advisors** and choose **Refresh**.
6. Open MetaEditor and compile the file. Do not attach it to a live chart until compile output is reviewed.

## Supervised dry-run

1. Attach the EA to an EURUSD chart on the RCG demo terminal.
2. Confirm `InpDryRunOnly=true` and the terminal ID is unique to this installation.
3. Read the Experts log for `TV_RCG_SCAN_BEGIN`, `TV_RCG_SYMBOL`, and `TV_RCG_SYMBOL_REVIEW_REQUIRED`.
4. Record exact broker symbols for the eight canonical instruments. Do not assume XAUUSD or Forex symbols have no suffix.
5. Confirm the EA reports that network transport is absent and no trading operations are available.
6. Detach the EA and confirm `TV_RCG_STOP` appears.

## Acceptance criteria

- [ ] MetaEditor reports zero errors; warnings are reviewed.
- [ ] EA initializes and stops cleanly.
- [ ] No existing EA files were changed.
- [ ] Exact broker symbol matches are recorded; ambiguous aliases remain unresolved.
- [ ] No order, position, pending-order, account mutation, or network API calls exist in source.
- [ ] No credentials or private account information appear in logs.
- [ ] The EA is detached after test.

## Explicitly out of scope

This dry-run does not collect candle history or tick streams, persist an offline queue, transmit data, issue credentials, or connect Scanner/Trading Brain. Those require a separately reviewed implementation and all release gates in `RCG_MT5_COLLECTOR_PLAN.md`.
