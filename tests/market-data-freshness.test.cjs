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

function candle(timestamp, retrievedAt, provisional = false) {
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

test("freshness measures from the confirmed candle close, not its open", () => {
  const now = new Date("2026-11-13T12:16:00.000Z");
  const result = validateCandles([
    candle("2026-11-13T12:00:00.000Z", now.toISOString()),
  ], { now, maxAgeSeconds: 120, timeframe: "M15" });

  assert.equal(result.freshnessSeconds, 60);
  assert.equal(result.status, "READY");
  assert.equal(result.eligibleCandleCount, 1);
});

test("freshness uses the latest confirmed close even when a newer candle is forming", () => {
  const now = new Date("2026-11-13T12:18:00.000Z");
  const result = validateCandles([
    candle("2026-11-13T12:15:00.000Z", now.toISOString(), true),
    candle("2026-11-13T12:00:00.000Z", now.toISOString(), false),
  ], { now, maxAgeSeconds: 120, timeframe: "M15" });

  assert.equal(result.freshnessSeconds, 180);
  assert.equal(result.status, "STALE");
  assert.equal(result.eligibleCandleCount, 0);
});

test("a candle marked confirmed before its close boundary is excluded", () => {
  const now = new Date("2026-11-13T12:16:00.000Z");
  const result = validateCandles([
    candle("2026-11-13T12:15:00.000Z", now.toISOString(), false),
  ], { now, maxAgeSeconds: 120, timeframe: "M15" });

  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.eligibleCandleCount, 0);
  assert.ok(result.warnings.some((entry) => /before their expected close boundary/i.test(entry)));
});

test("missing freshness calibration remains DEGRADED even with confirmed candles", () => {
  const now = new Date("2026-11-13T12:16:00.000Z");
  const result = validateCandles([
    candle("2026-11-13T12:00:00.000Z", now.toISOString()),
  ], { now, timeframe: "M15" });

  assert.equal(result.freshnessSeconds, 60);
  assert.equal(result.freshnessThresholdSeconds, null);
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.eligibleCandleCount, 1);
});
