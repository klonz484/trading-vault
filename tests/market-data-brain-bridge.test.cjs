/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { createMarketDataBrainHandoff } = require("../src/lib/market-data/brain-bridge.ts");

function snapshot(overrides = {}) {
  const candle = {
    instrument: "EURUSD",
    timeframe: "M15",
    timestamp: "2026-11-13T06:00:00.000Z",
    open: 1.15,
    high: 1.16,
    low: 1.14,
    close: 1.155,
    volume: 12,
    provider: "twelve_data",
    retrievedAt: "2026-11-13T06:15:00.000Z",
    sourceTimestamp: "2026-11-13 06:00:00",
    sourceTimezone: "UTC",
    provisional: false,
  };
  return {
    schemaVersion: "1.0.0",
    validatorVersion: "1.0.0",
    snapshotVersion: "snapshot:bridge:eurusd:m15",
    instrument: "EURUSD",
    timeframe: "M15",
    provider: "twelve_data",
    retrievedAt: "2026-11-13T06:15:00.000Z",
    source: {
      symbol: "EUR/USD",
      endpoint: "/time_series",
      attribution: "Twelve Data",
      sourceTimezone: "UTC",
      entitlementStatus: "VERIFIED",
      licenceStatus: "VERIFIED",
    },
    candles: [candle],
    rawCandles: [candle],
    correctionHistory: [],
    validation: {
      status: "READY",
      checkedAt: "2026-11-13T06:15:00.000Z",
      candleCount: 1,
      eligibleCandleCount: 1,
      invalidCandles: 0,
      duplicateTimestamps: [],
      outOfOrderTimestamps: [],
      missingIntervals: [],
      futureTimestamps: [],
      warnings: [],
      errors: [],
      freshnessSeconds: 0,
      freshnessThresholdSeconds: 120,
      confidenceScore: null,
      confidenceNote: "Not calibrated.",
    },
    limitations: [],
    ...overrides,
  };
}

test("provider snapshot reaches Brain handoff with provenance but no directional decision", () => {
  const result = createMarketDataBrainHandoff(snapshot());
  assert.equal(result.marketDataGate, "LIVE_ELIGIBLE");
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.decision, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.sourceReferences, ["market-data:snapshot:bridge:eurusd:m15"]);
  assert.ok(result.uncertainties.some((item) => /methodology/i.test(item)));
});

test("unverified provider rights keep the Brain handoff replay-only", () => {
  const input = snapshot({
    source: {
      ...snapshot().source,
      entitlementStatus: "UNVERIFIED",
      licenceStatus: "UNVERIFIED",
    },
  });
  const result = createMarketDataBrainHandoff(input);
  assert.equal(result.marketDataGate, "REPLAY_ONLY");
  assert.equal(result.decision, "INSUFFICIENT_EVIDENCE");
  assert.ok(result.uncertainties.some((item) => /market-data gate is REPLAY_ONLY/i.test(item)));
});

test("invalid provider candle is blocked before Brain assessment", () => {
  const input = snapshot({
    candles: [{ ...snapshot().candles[0], high: 1.13 }],
  });
  const result = createMarketDataBrainHandoff(input);
  assert.equal(result.marketDataGate, "BLOCKED");
  assert.equal(result.decision, "INSUFFICIENT_EVIDENCE");
});
