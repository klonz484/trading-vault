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
const { adaptMarketDataSnapshotForBrain } = require("../src/lib/trading-brain/market-data-adapter.ts");

function snapshot(overrides = {}) {
  const candle = {
    instrument: "EURUSD",
    timeframe: "M15",
    timestamp: "2026-11-12T10:00:00.000Z",
    open: 1.1,
    high: 1.12,
    low: 1.09,
    close: 1.11,
    volume: 10,
    provider: "twelve_data",
    retrievedAt: "2026-11-12T10:15:00.000Z",
    sourceTimestamp: "2026-11-12 10:00:00",
    sourceTimezone: "UTC",
    provisional: false,
  };
  return {
    schemaVersion: "1.0.0",
    validatorVersion: "1.0.0",
    snapshotVersion: "snapshot:test:eurusd:m15",
    instrument: "EURUSD",
    timeframe: "M15",
    provider: "twelve_data",
    retrievedAt: "2026-11-12T10:15:00.000Z",
    source: {
      symbol: "EUR/USD",
      endpoint: "time_series",
      attribution: "test fixture",
      sourceTimezone: "UTC",
      entitlementStatus: "VERIFIED",
      licenceStatus: "VERIFIED",
    },
    candles: [candle],
    rawCandles: [candle],
    correctionHistory: [],
    validation: {
      status: "READY",
      checkedAt: "2026-11-12T10:15:00.000Z",
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
      confidenceNote: "No calibrated score.",
    },
    limitations: [],
    ...overrides,
  };
}

test("verified READY snapshot is adapted with source provenance", () => {
  const result = adaptMarketDataSnapshotForBrain(snapshot());
  assert.equal(result.gate, "LIVE_ELIGIBLE");
  assert.equal(result.instrument, "EURUSD");
  assert.equal(result.timeframe, "M15");
  assert.equal(result.provider, "twelve_data");
  assert.equal(result.sourceReferences[0], "market-data:snapshot:test:eurusd:m15");
  assert.equal(result.candles.length, 1);
  assert.equal(result.candles[0].provisional, false);
});

test("unverified entitlement or licence keeps snapshot replay-only", () => {
  const unverified = snapshot({
    source: {
      symbol: "EUR/USD",
      endpoint: "time_series",
      attribution: "test fixture",
      sourceTimezone: "UTC",
      entitlementStatus: "UNVERIFIED",
      licenceStatus: "VERIFIED",
    },
  });
  const result = adaptMarketDataSnapshotForBrain(unverified);
  assert.equal(result.gate, "REPLAY_ONLY");
  assert.equal(result.candles.length, 1);
  assert.match(result.limitations.join(" "), /live Brain assessment is blocked/i);
});

test("non-READY snapshot is replay-only and never promoted", () => {
  const result = adaptMarketDataSnapshotForBrain(snapshot({
    validation: { ...snapshot().validation, status: "STALE" },
  }));
  assert.equal(result.gate, "REPLAY_ONLY");
  assert.equal(result.readiness, "STALE");
});

test("empty or invalidly versioned snapshot is blocked", () => {
  const result = adaptMarketDataSnapshotForBrain(snapshot({
    snapshotVersion: "",
    candles: [],
  }));
  assert.equal(result.gate, "BLOCKED");
  assert.deepEqual(result.candles, []);
});

test("READY label with validation errors or mismatched counts cannot be live eligible", () => {
  const dirty = snapshot({
    validation: {
      ...snapshot().validation,
      errors: ["test integrity issue"],
    },
  });
  assert.equal(adaptMarketDataSnapshotForBrain(dirty).gate, "REPLAY_ONLY");

  const mismatched = snapshot({
    validation: {
      ...snapshot().validation,
      eligibleCandleCount: 2,
    },
  });
  assert.equal(adaptMarketDataSnapshotForBrain(mismatched).gate, "REPLAY_ONLY");
});
