/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures/trading-brain-mtf-replay.json"),
  "utf8",
));
const { replayClosedCandles } = require("../src/lib/trading-brain/replay.ts");

const expectedTimeframes = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"];
const expectedInstruments = ["EURUSD", "XAUUSD"];

function noTradeStrategy(context) {
  return {
    action: "NO_TRADE",
    ruleSetVersion: "synthetic-mtf-fixture/1.0.0",
    rationale: "Boundary validation only; no trading methodology is evaluated.",
    sourceTimestamps: [context.current.timestamp],
  };
}

test("multi-timeframe fixture is explicitly synthetic and covers the initial instruments", () => {
  assert.equal(fixture.fixtureVersion, "1.0.0");
  assert.equal(fixture.classification, "SYNTHETIC_TEST_DATA_NOT_MARKET_DATA");
  assert.match(fixture.description, /not sourced from a broker or market-data provider/i);
  assert.deepEqual(Object.keys(fixture.instruments).sort(), expectedInstruments);

  for (const instrument of expectedInstruments) {
    assert.deepEqual(Object.keys(fixture.instruments[instrument]).sort(), [...expectedTimeframes].sort());
  }
});

test("EURUSD and XAUUSD replay stays inside each timeframe's as-of boundary", () => {
  const asOfMs = Date.parse(fixture.asOf);
  assert.ok(Number.isFinite(asOfMs));

  for (const instrument of expectedInstruments) {
    for (const timeframe of expectedTimeframes) {
      const candles = fixture.instruments[instrument][timeframe].candles;
      assert.equal(candles.length, 3, `${instrument} ${timeframe} fixture size`);

      const timestamps = candles.map((candle) => Date.parse(candle.timestamp));
      assert.ok(timestamps.every(Number.isFinite));
      assert.ok(timestamps[0] < timestamps[1] && timestamps[1] < timestamps[2]);
      assert.equal(candles[0].provisional, false);
      assert.equal(candles[1].provisional, true);
      assert.equal(candles[2].provisional, false);
      assert.ok(timestamps[0] <= asOfMs);
      assert.ok(timestamps[1] <= asOfMs);
      assert.ok(timestamps[2] > asOfMs);

      const seen = [];
      const result = replayClosedCandles({
        candles,
        endAt: fixture.asOf,
        strategy: (context) => {
          seen.push(context);
          return noTradeStrategy(context);
        },
      });

      assert.equal(result.status, "COMPLETE", `${instrument} ${timeframe}`);
      assert.equal(result.includedCandleCount, 1);
      assert.equal(result.excludedProvisionalCount, 1);
      assert.equal(result.records.length, 1);
      assert.equal(seen.length, 1);
      assert.ok(Date.parse(seen[0].asOf) <= asOfMs);
      assert.ok(seen[0].history.every((candle) => Date.parse(candle.timestamp) <= asOfMs));
      assert.equal(seen[0].history.some((candle) => candle.provisional), false);
    }
  }
});

test("fixture replay is deterministic and does not create live market-data eligibility", () => {
  for (const instrument of expectedInstruments) {
    for (const timeframe of expectedTimeframes) {
      const candles = fixture.instruments[instrument][timeframe].candles;
      const run = () => replayClosedCandles({
        candles,
        endAt: fixture.asOf,
        strategy: noTradeStrategy,
      });
      assert.deepEqual(run(), run());
    }
  }
  assert.equal(fixture.classification, "SYNTHETIC_TEST_DATA_NOT_MARKET_DATA");
  assert.equal(Object.hasOwn(fixture, "provider"), false);
  assert.equal(Object.hasOwn(fixture, "entitlementStatus"), false);
  assert.equal(Object.hasOwn(fixture, "licenceStatus"), false);
});
