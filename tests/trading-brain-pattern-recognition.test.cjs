/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { recognizeCandlePatterns } = require("../src/lib/trading-brain/skills/pattern-recognition.ts");

const sourceReferences = [{
  sourceId: "test-feed",
  providerId: "test-provider",
  observedAt: "2026-11-06T12:00:00.000Z",
  receivedAt: "2026-11-06T12:00:01.000Z",
  instrument: "EURUSD",
  timeframe: "H1",
}];

const policy = {
  minimumClosedCandles: 2,
  maximumClosedCandleAgeSeconds: 7200,
  lookbackCandles: 20,
  dojiMaximumBodyToRangeRatio: 0.1,
  pinBarMinimumWickToBodyRatio: 2,
  pinBarMaximumOppositeWickToRangeRatio: 0.15,
};

function candle(timestamp, open, high, low, close, isClosed = true) {
  return { timestamp, open, high, low, close, isClosed };
}

function run(candles, overrides = {}) {
  return recognizeCandlePatterns({
    instrument: "EURUSD",
    timeframe: "H1",
    asOf: "2026-11-06T12:30:00.000Z",
    candles,
    evidenceGate: { status: "COMPLETE", evidenceReadiness: "READY" },
    sourceReferences,
    policy: { ...policy, ...overrides },
  });
}

test("requires explicit policy and READY upstream evidence", () => {
  const base = {
    instrument: "EURUSD", timeframe: "H1", asOf: "2026-11-06T12:30:00.000Z",
    candles: [candle("2026-11-06T10:00:00.000Z", 1, 1.1, 0.9, 1), candle("2026-11-06T11:00:00.000Z", 1, 1.1, 0.9, 1)],
    evidenceGate: { status: "COMPLETE", evidenceReadiness: "READY" }, sourceReferences,
  };
  assert.equal(recognizeCandlePatterns(base).findings[0].code, "POLICY_MISSING");
  assert.equal(recognizeCandlePatterns({ ...base, policy, evidenceGate: { status: "INCOMPLETE", evidenceReadiness: "INCOMPLETE" } }).findings[0].code, "EVIDENCE_NOT_READY");
});

test("detects bullish and bearish engulfing patterns with exact candle references", () => {
  const bullish = run([
    candle("2026-11-06T10:00:00.000Z", 1.105, 1.11, 1.09, 1.095),
    candle("2026-11-06T11:00:00.000Z", 1.09, 1.115, 1.085, 1.11),
  ]);
  assert.ok(bullish.assessment.patterns.some((item) => item.type === "BULLISH_ENGULFING" && item.startCandleIndex === 0 && item.endCandleIndex === 1));
  const bearish = run([
    candle("2026-11-06T10:00:00.000Z", 1.095, 1.11, 1.09, 1.105),
    candle("2026-11-06T11:00:00.000Z", 1.11, 1.115, 1.085, 1.09),
  ]);
  assert.ok(bearish.assessment.patterns.some((item) => item.type === "BEARISH_ENGULFING"));
});

test("detects inside bars, outside bars and doji using configured thresholds", () => {
  const result = run([
    candle("2026-11-06T09:00:00.000Z", 1.1, 1.12, 1.08, 1.11),
    candle("2026-11-06T10:00:00.000Z", 1.105, 1.115, 1.09, 1.11),
    candle("2026-11-06T11:00:00.000Z", 1.11, 1.13, 1.07, 1.11),
  ]);
  const types = result.assessment.patterns.map((item) => item.type);
  assert.ok(types.includes("INSIDE_BAR"));
  assert.ok(types.includes("OUTSIDE_BAR"));
  assert.ok(types.includes("DOJI"));
});

test("detects bullish and bearish pin bars only when explicit wick ratios qualify", () => {
  const bullish = run([
    candle("2026-11-06T10:00:00.000Z", 1.10, 1.102, 1.07, 1.101),
    candle("2026-11-06T11:00:00.000Z", 1.10, 1.102, 1.07, 1.101),
  ]);
  assert.ok(bullish.assessment.patterns.some((item) => item.type === "BULLISH_PIN_BAR"));
  const bearish = run([
    candle("2026-11-06T10:00:00.000Z", 1.10, 1.13, 1.098, 1.101),
    candle("2026-11-06T11:00:00.000Z", 1.10, 1.13, 1.098, 1.101),
  ]);
  assert.ok(bearish.assessment.patterns.some((item) => item.type === "BEARISH_PIN_BAR"));
});

test("forming candles are excluded from pattern calculations", () => {
  const result = run([
    candle("2026-11-06T10:00:00.000Z", 1.105, 1.11, 1.09, 1.095),
    candle("2026-11-06T11:00:00.000Z", 1.09, 1.115, 1.085, 1.11),
    candle("2026-11-06T12:00:00.000Z", 1.11, 1.2, 1.0, 1.19, false),
  ]);
  assert.equal(result.assessment.formingCandlesExcluded, 1);
  assert.equal(result.assessment.latestClosedCandleAt, "2026-11-06T11:00:00.000Z");
  assert.ok(result.assessment.patterns.every((item) => item.endAt !== "2026-11-06T12:00:00.000Z"));
});

test("rejects invalid timestamps, ordering, OHLC and mismatched source identity", () => {
  assert.equal(run([candle("2026-11-06T11:00:00.000Z", 1, 1.1, 0.9, 1), candle("2026-11-06T10:00:00.000Z", 1, 1.1, 0.9, 1)]).findings[0].code, "CANDLE_ORDER_INVALID");
  assert.equal(run([candle("2026-11-06T10:00:00.000Z", 1, 0.8, 0.9, 1), candle("2026-11-06T11:00:00.000Z", 1, 1.1, 0.9, 1)]).findings[0].code, "INVALID_OHLC");
  assert.equal(run([candle("2026-11-06T13:00:00.000Z", 1, 1.1, 0.9, 1), candle("2026-11-06T11:00:00.000Z", 1, 1.1, 0.9, 1)]).findings[0].code, "INVALID_TIMESTAMP");
  const mismatch = run([candle("2026-11-06T10:00:00.000Z", 1, 1.1, 0.9, 1), candle("2026-11-06T11:00:00.000Z", 1, 1.1, 0.9, 1)]);
  assert.equal(recognizeCandlePatterns({
    instrument: "EURUSD", timeframe: "H1", asOf: "2026-11-06T12:30:00.000Z",
    candles: [candle("2026-11-06T10:00:00.000Z", 1, 1.1, 0.9, 1), candle("2026-11-06T11:00:00.000Z", 1, 1.1, 0.9, 1)],
    evidenceGate: { status: "COMPLETE", evidenceReadiness: "READY" },
    sourceReferences: [{ ...sourceReferences[0], instrument: "XAUUSD" }], policy,
  }).findings[0].code, "SOURCE_IDENTITY_MISMATCH");
  assert.equal(mismatch.status, "COMPLETE");
});

test("reports stale and insufficient candle history without emitting patterns", () => {
  const stale = recognizeCandlePatterns({
    instrument: "EURUSD", timeframe: "H1", asOf: "2026-11-06T15:00:00.000Z",
    candles: [candle("2026-11-06T10:00:00.000Z", 1, 1.1, 0.9, 1), candle("2026-11-06T11:00:00.000Z", 1, 1.1, 0.9, 1)],
    evidenceGate: { status: "COMPLETE", evidenceReadiness: "READY" }, sourceReferences, policy,
  });
  assert.equal(stale.findings[0].code, "CLOSED_CANDLE_STALE");
  assert.equal(run([candle("2026-11-06T11:00:00.000Z", 1, 1.1, 0.9, 1)]).findings[0].code, "INSUFFICIENT_CANDLES");
});

test("rejects malformed thresholds and never emits trade recommendations or confidence", () => {
  assert.equal(run([
    candle("2026-11-06T10:00:00.000Z", 1, 1.1, 0.9, 1),
    candle("2026-11-06T11:00:00.000Z", 1, 1.1, 0.9, 1),
  ], { dojiMaximumBodyToRangeRatio: 1.5 }).findings[0].code, "INVALID_POLICY");
  const result = run([
    candle("2026-11-06T10:00:00.000Z", 1.105, 1.11, 1.09, 1.095),
    candle("2026-11-06T11:00:00.000Z", 1.09, 1.115, 1.085, 1.11),
  ]);
  assert.deepEqual(result.interpretations, []);
  assert.ok(result.limitations.some((item) => item.includes("trade recommendation")));
  assert.ok(!("confidence" in result.assessment));
});
