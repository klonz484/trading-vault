# MT5 timestamp evidence review — 2026-11-13

## Executive finding

The timestamp blocker remains open. Public MetaQuotes material supports treating MT5 chart/history timestamps as broker-server time unless proven otherwise, but the available public material does not establish the exact RCG Markets trade-server timezone or its historical daylight-saving schedule. Do not normalize RCG timestamps to UTC from a current offset or from assumptions about common broker practice.

## MetaQuotes documentation reviewed

1. **MQL5 local and server time** — https://www.mql5.com/en/book/common/timing/timing_local_server
   - Describes local computer time and broker server time as distinct clocks.
   - TimeCurrent is the last known server time, updated with incoming quotes.
   - TimeTradeServer is an estimate based on local time and the last-known client/server timezone difference.
   - The page notes that local clock synchronization matters and that the estimate can differ from exact server time.
   - Consequence: TimeTradeServer is useful as a diagnostic observation, not independent proof of UTC or of historical broker offset rules.

2. **MqlTick structure** — https://www.mql5.com/en/docs/constants/structures/mqltick
   - Defines the time field as the time of the last price update and time_msc as the time of the last price update in milliseconds.
   - The structure reference does not specify that native SymbolInfoTick/MqlTick.time_msc is UTC epoch milliseconds.
   - Consequence: the field name and unit do not establish its timezone basis.

3. **MetaQuotes forum moderator clarification** — https://www.mql5.com/en/forum/516958
   - A MetaQuotes forum moderator response dated 2026-11-10 says the MT5 terminal returns date/time from the connected server, not UTC, and that each MT5 server follows its own time/DST settings.
   - This is strong platform-level warning evidence, but it is not written confirmation for the exact RCG server/account cluster. Keep RCG-specific verification open.

## RCG Markets public information reviewed

- Current RCG contact page lists support@rcgmarkets.com and phone +27 (10) 035 5198: https://www.rcgmarkets.com/support/contact-us
- The publicly available RCG client agreement states that market trading hours are subject to rollover and daylight-saving changes: https://assets-global.website-files.com/618ecb9763e89eb52ae5c8e7/662a3fab1f3462ce6e35bc05_RCG%20MARKETS%20CLIENT%20AGREEMENT.pdf
- The public material reviewed does not specify the MT5 trade-server timezone, whether timestamps use server wall time for every relevant history API, or the historical UTC-offset/DST transition schedule.

## Required broker confirmation

Ask RCG Trader Support to confirm in writing for the exact MT5 server/account cluster used by the owner:

1. The trade-server timezone/clock basis for chart candles, MqlRates.time, MqlTick.time, and native MqlTick.time_msc / SymbolInfoTick.
2. Whether these native terminal values represent broker-server wall time or UTC epoch values.
3. The complete historical UTC offset and DST schedule, including effective transition dates, covering the desired historical backfill.
4. Whether the schedule differs by server, account type, instrument group, or terminal/API path.
5. Whether any historical timestamps are revised after initial publication.

Suggested contact: support@rcgmarkets.com (official contact page). Do not send account passwords, API keys, MT5 investor/master passwords, or private credentials.

## Supervised evidence capture still required

During an open market session, capture a read-only paired sample from the exact connected RCG MT5 terminal:
- TimeCurrent()
- TimeTradeServer()
- TimeGMT()
- TimeLocal()
- MqlTick.time
- MqlTick.time_msc
- an independent trusted UTC clock observed at the same moment
- terminal build, broker server name, and capture time

Repeat after a broker clock transition if possible. Verify the Linux host's clock synchronization and timezone separately. Do not use Strategy Tester output as a substitute for live-server evidence.

## Engineering decision

- Keep the API future-time guard unchanged.
- Keep the uploader in dry-run.
- Do not transmit RCG batches or treat RCG observations as eligible Market Data / Scanner / Brain evidence.
- Do not apply a current server offset to historical candles.
- Finalize and implement timestamp contract v2 only after broker confirmation and paired-clock evidence. Preserve raw timestamps and conversion provenance; quarantine ambiguous observations.
