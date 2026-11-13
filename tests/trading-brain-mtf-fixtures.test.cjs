/* global require, module */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures/trading-brain-mtf-replay.json"),
  "utf8",
));
const { replayClosedCandles } = require("../src/lib/trading-brain/replay.ts");
const { selectClosedMultiTimeframeEvidence } = require("../src/lib/trading-brain/multi-timeframe-replay.ts");

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
      assert.equal(candles.length, 4, `${instrument} ${timeframe} fixture size`);

      const timestamps = candles.map((candle) => Date.parse(candle.timestamp));
      assert.ok(timestamps.every(Number.isFinite));
      assert.ok(timestamps[0] < timestamps[1] && timestamps[1] < timestamps[2] && timestamps[2] < timestamps[3]);
      assert.equal(candles[0].provisional, false);
      assert.equal(candles[1].provisional, false);
      assert.equal(candles[2].provisional, true);
      assert.equal(candles[3].provisional, false);
      assert.ok(timestamps[0] <= asOfMs);
      assert.ok(timestamps[1] <= asOfMs);
      assert.ok(timestamps[2] <= asOfMs);
      assert.ok(timestamps[3] > asOfMs);

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
      assert.equal(result.includedCandleCount, 2);
      assert.equal(result.excludedProvisionalCount, 1);
      assert.equal(result.records.length, 2);
      assert.equal(seen.length, 2);
      assert.ok(Date.parse(seen[0].asOf) <= asOfMs);
      assert.ok(seen[0].history.every((candle) => Date.parse(candle.timestamp) <= asOfMs));
      assert.equal(seen.every((context) => context.history.every((candle) => !candle.provisional)), true);
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

test("multi-timeframe selector aligns latest closed evidence at a common as-of boundary", () => {
  const asOfMs = Date.parse(fixture.asOf);
  for (const instrument of expectedInstruments) {
    const streams = expectedTimeframes.map((timeframe) => ({
      timeframe,
      candles: fixture.instruments[instrument][timeframe].candles,
    }));
    const result = selectClosedMultiTimeframeEvidence({
      instrument,
      asOf: fixture.asOf,
      streams,
    });

    assert.equal(result.status, "COMPLETE", instrument);
    assert.deepEqual(result.missingTimeframes, []);
    assert.deepEqual(Object.keys(result.evidence).sort(), [...expectedTimeframes].sort());
    assert.equal(result.excludedProvisionalCount, expectedTimeframes.length);
    for (const timeframe of expectedTimeframes) {
      const selected = result.evidence[timeframe];
      assert.ok(selected);
      assert.equal(selected.provisional, false);
      assert.equal(selected.timestamp, fixture.instruments[instrument][timeframe].candles[1].timestamp);
      assert.ok(Date.parse(selected.timestamp) <= asOfMs);
      assert.ok(Date.parse(selected.availableAt) <= asOfMs);
    }
  }
});

test("multi-timeframe selector reports missing evidence and rejects duplicate streams", () => {
  const streams = expectedTimeframes.map((timeframe) => ({
    timeframe,
    candles: fixture.instruments.EURUSD[timeframe].candles,
  }));
  const incomplete = selectClosedMultiTimeframeEvidence({
    instrument: "EURUSD",
    asOf: fixture.asOf,
    streams: streams.slice(1),
  });
  assert.equal(incomplete.status, "INCOMPLETE");
  assert.deepEqual(incomplete.missingTimeframes, ["M1"]);

  const duplicate = selectClosedMultiTimeframeEvidence({
    instrument: "EURUSD",
    asOf: fixture.asOf,
    streams: [...streams, streams[0]],
  });
  assert.equal(duplicate.status, "REJECTED");
  assert.match(duplicate.findings.join(" "), /duplicate stream/i);
});

test("multi-timeframe selector excludes candles not yet available at asOf", () => {
  const asOfMs = Date.parse(fixture.asOf);
  const streams = expectedTimeframes.map((timeframe) => ({
    timeframe,
    candles: fixture.instruments.EURUSD[timeframe].candles.map((candle, index) =>
      index === 1
        ? { ...candle, provisional: false, availableAt: new Date(asOfMs + 1).toISOString() }
        : candle,
    ),
  }));
  const result = selectClosedMultiTimeframeEvidence({
    instrument: "EURUSD",
    asOf: fixture.asOf,
    streams,
  });

  assert.equal(result.status, "COMPLETE");
  for (const timeframe of expectedTimeframes) {
    assert.equal(
      result.evidence[timeframe].timestamp,
      fixture.instruments.EURUSD[timeframe].candles[0].timestamp,
    );
    assert.ok(Date.parse(result.evidence[timeframe].availableAt) <= asOfMs);
  }
});

test("multi-timeframe selector rejects invalid candle availability metadata", () => {
  const streams = expectedTimeframes.map((timeframe) => ({
    timeframe,
    candles: fixture.instruments.EURUSD[timeframe].candles.map((candle, index) =>
      index === 0 ? { ...candle, availableAt: "not-a-timestamp" } : candle,
    ),
  }));
  const result = selectClosedMultiTimeframeEvidence({
    instrument: "EURUSD",
    asOf: fixture.asOf,
    streams,
  });
  assert.equal(result.status, "REJECTED");
  assert.match(result.findings.join(" "), /availability metadata/i);
});
