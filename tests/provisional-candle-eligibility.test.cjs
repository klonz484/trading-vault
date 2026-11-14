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

const { validateCandles } = require("../src/lib/market-data/quality.ts");
const { TwelveDataProvider } = require("../src/lib/market-data/providers/twelve-data.ts");
const { getTwelveDataSnapshot } = require("../src/lib/market-data/service.ts");
const { adaptMarketDataSnapshotForBrain } = require("../src/lib/trading-brain/market-data-adapter.ts");

function candle(timestamp, retrievedAt, provisional) {
  return {
    instrument: "EURUSD",
    timeframe: "M15",
    timestamp,
    open: 1.1,
    high: 1.12,
    low: 1.09,
    close: 1.11,
    volume: 10,
    provider: "twelve_data",
    retrievedAt,
    sourceTimestamp: timestamp.slice(0, 19).replace("T", " "),
    sourceTimezone: "UTC",
    provisional,
  };
}

function brainSnapshot(candleOverrides = {}, validationOverrides = {}) {
  const retrievedAt = "2026-11-13T12:16:00.000Z";
  const confirmed = candle(
    "2026-11-13T12:00:00.000Z",
    retrievedAt,
    false,
  );
  const item = { ...confirmed, ...candleOverrides };
  return {
    schemaVersion: "1.0.0",
    validatorVersion: "1.0.0",
    snapshotVersion: "snapshot:provisional-test",
    instrument: "EURUSD",
    timeframe: "M15",
    provider: "twelve_data",
    retrievedAt,
    source: {
      symbol: "EUR/USD",
      endpoint: "/time_series",
      attribution: "Twelve Data",
      sourceTimezone: "UTC",
      entitlementStatus: "VERIFIED",
      licenceStatus: "VERIFIED",
    },
    candles: [item],
    rawCandles: [item],
    correctionHistory: [],
    validation: {
      status: "READY",
      checkedAt: retrievedAt,
      candleCount: 1,
      eligibleCandleCount: 1,
      invalidCandles: 0,
      duplicateTimestamps: [],
      outOfOrderTimestamps: [],
      missingIntervals: [],
      futureTimestamps: [],
      warnings: [],
      errors: [],
      freshnessSeconds: 60,
      freshnessThresholdSeconds: 3600,
      confidenceScore: null,
      confidenceNote: "Test fixture.",
      ...validationOverrides,
    },
    limitations: [],
  };
}

test("forming M15 candle remains an observation but is not eligible", () => {
  const retrievedAt = new Date("2026-11-13T12:16:00.000Z");
  const result = validateCandles([
    candle("2026-11-13T12:00:00.000Z", retrievedAt.toISOString(), false),
    candle("2026-11-13T12:15:00.000Z", retrievedAt.toISOString(), true),
  ], {
    now: retrievedAt,
    maxAgeSeconds: 3600,
    timeframe: "M15",
  });

  assert.equal(result.status, "READY");
  assert.equal(result.candleCount, 2);
  assert.equal(result.eligibleCandleCount, 1);
  assert.ok(result.warnings.some((entry) => /forming candle/i.test(entry)));
});

test("a series containing only forming candles is incomplete", () => {
  const retrievedAt = new Date("2026-11-13T12:16:00.000Z");
  const result = validateCandles([
    candle("2026-11-13T12:15:00.000Z", retrievedAt.toISOString(), true),
  ], {
    now: retrievedAt,
    maxAgeSeconds: 3600,
    timeframe: "M15",
  });

  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.candleCount, 1);
  assert.equal(result.eligibleCandleCount, 0);
});

test("market-data service keeps provisional candles raw and returns confirmed candles only", async () => {
  const original = TwelveDataProvider.prototype.getTimeSeries;
  const now = new Date();
  const currentIntervalMs = Math.floor(now.getTime() / 900000) * 900000;
  const currentInterval = new Date(currentIntervalMs).toISOString();
  const previousInterval = new Date(currentIntervalMs - 900000).toISOString();
  const retrievedAt = now.toISOString();

  TwelveDataProvider.prototype.getTimeSeries = async () => ({
    symbol: "EUR/USD",
    retrievedAt,
    candles: [
      candle(currentInterval, retrievedAt, true),
      candle(previousInterval, retrievedAt, false),
    ],
  });

  try {
    const result = await getTwelveDataSnapshot("EURUSD", "M15", {
      maxAgeSeconds: 3600,
    });
    assert.equal(result.rawCandles.length, 2);
    assert.equal(result.candles.length, 1);
    assert.equal(result.candles[0].provisional, false);
    assert.equal(result.validation.eligibleCandleCount, 1);
  } finally {
    TwelveDataProvider.prototype.getTimeSeries = original;
  }
});

test("Brain refuses a provisional candle even if the snapshot claims READY", () => {
  const input = brainSnapshot({ provisional: true });
  const result = adaptMarketDataSnapshotForBrain(input);

  assert.equal(result.gate, "REPLAY_ONLY");
  assert.equal(result.candles.length, 1);
  assert.equal(result.candles[0].provisional, true);
  assert.ok(result.limitations.some((entry) => /forming candles/i.test(entry)));
});

test("Brain accepts a confirmed subset while raw observation count includes a forming candle", () => {
  const input = brainSnapshot({}, {
    candleCount: 2,
    eligibleCandleCount: 1,
  });
  const result = adaptMarketDataSnapshotForBrain(input);

  assert.equal(result.gate, "LIVE_ELIGIBLE");
  assert.equal(result.candles.length, 1);
  assert.equal(result.candles[0].provisional, false);
});
