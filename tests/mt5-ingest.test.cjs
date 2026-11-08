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
const { validateMT5IngestBatch } = require("../src/lib/market-data/mt5-ingest.ts");

const validBatch = {
  schemaVersion: "1.0.0",
  batchId: "batch-001",
  brokerId: "RCG_MARKETS",
  terminalInstanceId: "rcg-terminal-a",
  sentAt: "2026-11-08T11:00:00.000Z",
  candles: [{
    instrument: "EURUSD", brokerSymbol: "EURUSD.a", timeframe: "M1",
    sourceTime: "2026-11-08T10:59:00.000Z",
    open: 1.08, high: 1.081, low: 1.079, close: 1.0805,
    tickVolume: 120, realVolume: null, spreadPoints: 12, provisional: false,
  }],
  ticks: [{
    instrument: "EURUSD", brokerSymbol: "EURUSD.a",
    sourceTimeMs: 1794135540123, bid: 1.08, ask: 1.08012,
    last: null, volume: null, volumeReal: null, flags: 6,
  }],
};

test("valid read-only MT5 candle and tick batches pass schema validation", () => {
  const result = validateMT5IngestBatch(validBatch);
  assert.equal(result.status, "ACCEPTABLE");
  assert.equal(result.acceptedCandleCount, 1);
  assert.equal(result.acceptedTickCount, 1);
});

test("unsupported broker, instrument and timeframe are rejected", () => {
  const result = validateMT5IngestBatch({
    ...validBatch, brokerId: "UNKNOWN",
    candles: [{ ...validBatch.candles[0], instrument: "BTCUSD", timeframe: "M2" }],
  });
  assert.equal(result.status, "REJECTED");
  assert.ok(result.errors.some((error) => error.includes("Broker identity")));
  assert.ok(result.errors.some((error) => error.includes("unsupported instrument")));
  assert.ok(result.errors.some((error) => error.includes("unsupported timeframe")));
});

test("forming candles are explicitly warned and never silently treated as confirmed", () => {
  const result = validateMT5IngestBatch({
    ...validBatch, candles: [{ ...validBatch.candles[0], provisional: true }],
  });
  assert.equal(result.status, "ACCEPTABLE");
  assert.ok(result.warnings.some((warning) => warning.includes("Provisional candles")));
});

test("invalid OHLC, crossed quotes and duplicate events are rejected", () => {
  const result = validateMT5IngestBatch({
    ...validBatch,
    candles: [
      validBatch.candles[0],
      { ...validBatch.candles[0], open: 1.09, sourceTime: "2026-11-08T10:59:00.000Z" },
    ],
    ticks: [{ ...validBatch.ticks[0], ask: 1.079 }],
  });
  assert.equal(result.status, "REJECTED");
  assert.ok(result.errors.some((error) => error.includes("OHLC")));
  assert.ok(result.errors.some((error) => error.includes("bid/ask")));
  assert.ok(result.errors.some((error) => error.includes("Duplicate")));
  assert.equal(result.acceptedCandleCount, 0);
  assert.equal(result.acceptedTickCount, 0);
});

test("malformed batches and oversized batches fail closed", () => {
  assert.equal(validateMT5IngestBatch(null).status, "REJECTED");
  const result = validateMT5IngestBatch({
    ...validBatch, candles: Array(5001).fill(validBatch.candles[0]), ticks: [],
  });
  assert.equal(result.status, "REJECTED");
  assert.ok(result.errors.some((error) => error.includes("count limit")));
});
