/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { assessIndicators } = require("../src/lib/trading-brain/skills/indicator.ts");

const source = {
  sourceId: "candles-v1",
  providerId: "test-feed",
  observedAt: "2026-11-06T00:00:00.000Z",
  receivedAt: "2026-11-06T00:00:01.000Z",
  instrument: "EURUSD",
  timeframe: "H1",
};

function candles(count = 20) {
  const start = Date.parse("2026-11-06T00:00:00.000Z");
  return Array.from({ length: count }, (_, index) => {
    const open = 1.1 + index * 0.001;
    const close = open + (index % 3 === 0 ? -0.0002 : 0.0004);
    return {
      timestamp: new Date(start + index * 3_600_000).toISOString(),
      open,
      high: Math.max(open, close) + 0.0005,
      low: Math.min(open, close) - 0.0005,
      close,
      isClosed: true,
    };
  });
}

function input(overrides = {}) {
  const history = candles();
  return {
    instrument: "EURUSD",
    timeframe: "H1",
    asOf: "2026-11-06T20:10:00.000Z",
    candles: history,
    evidenceGate: { status: "COMPLETE", evidenceReadiness: "READY" },
    sourceReferences: [source],
    configuration: {
      smaPeriods: [5],
      emaPeriods: [5],
      rsiPeriods: [5],
      atrPeriods: [5],
      macd: { fastPeriod: 3, slowPeriod: 6, signalPeriod: 3 },
    },
    ...overrides,
  };
}

const policy = {
  minimumClosedCandles: 10,
  maximumClosedCandleAgeSeconds: 7_200,
};

test("requires explicit indicator policy and configuration", () => {
  const result = assessIndicators(input());
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.findings[0].code, "POLICY_MISSING");
});

test("calculates configured SMA, EMA, Wilder RSI, Wilder ATR and MACD", () => {
  const result = assessIndicators(input(), policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.deepEqual(result.assessment.values.map((value) => value.type), [
    "SMA", "EMA", "RSI_WILDER", "ATR_WILDER", "MACD",
  ]);
  for (const value of result.assessment.values) assert.ok(Number.isFinite(value.value));
  const macd = result.assessment.values.find((value) => value.type === "MACD");
  assert.ok(Number.isFinite(macd.signal));
  assert.ok(Number.isFinite(macd.histogram));
});

test("excludes forming candles and reports their count", () => {
  const history = candles();
  history.push({
    timestamp: "2026-11-06T20:00:00.000Z",
    open: 1.12,
    high: 1.121,
    low: 1.119,
    close: 1.1205,
    isClosed: false,
  });
  const result = assessIndicators(input({
    candles: history,
    asOf: "2026-11-06T20:10:00.000Z",
  }), policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.assessment.closedCandleCount, 20);
  assert.equal(result.assessment.formingCandlesExcluded, 1);
  assert.equal(result.assessment.latestClosedCandleAt, "2026-11-06T19:00:00.000Z");
});

test("requires upstream evidence readiness and source provenance", () => {
  const notReady = assessIndicators(input({
    evidenceGate: { status: "INCOMPLETE", evidenceReadiness: "DEGRADED" },
  }), policy);
  assert.equal(notReady.findings[0].code, "EVIDENCE_NOT_READY");

  const noSource = assessIndicators(input({ sourceReferences: [] }), policy);
  assert.equal(noSource.findings[0].code, "SOURCE_PROVENANCE_MISSING");
});

test("rejects source references for a different instrument or timeframe", () => {
  const result = assessIndicators(input({
    sourceReferences: [{ ...source, instrument: "XAUUSD" }],
  }), policy);
  assert.equal(result.findings[0].code, "SOURCE_IDENTITY_MISMATCH");
});

test("rejects unordered, duplicate, future, and timezone-less timestamps", () => {
  const history = candles();
  const future = [...history];
  future[future.length - 1] = { ...future[future.length - 1], timestamp: "2026-11-07T00:00:00.000Z" };
  assert.equal(assessIndicators(input({ candles: future }), policy).findings[0].code, "INVALID_TIMESTAMP");

  const unordered = [...history];
  [unordered[1], unordered[2]] = [unordered[2], unordered[1]];
  assert.equal(assessIndicators(input({ candles: unordered }), policy).findings[0].code, "CANDLE_ORDER_INVALID");

  const noZone = [...history];
  noZone[0] = { ...noZone[0], timestamp: "2026-11-06T00:00:00" };
  assert.equal(assessIndicators(input({ candles: noZone }), policy).findings[0].code, "INVALID_TIMESTAMP");
});

test("rejects invalid OHLC and stale latest closed candles", () => {
  const malformed = candles();
  malformed[0] = { ...malformed[0], high: malformed[0].low - 1 };
  assert.equal(assessIndicators(input({ candles: malformed }), policy).findings[0].code, "INVALID_OHLC");

  const stale = assessIndicators(input({ asOf: "2026-11-06T21:00:00.000Z" }), {
    minimumClosedCandles: 10,
    maximumClosedCandleAgeSeconds: 30,
  });
  assert.equal(stale.findings[0].code, "CLOSED_CANDLE_STALE");
});

test("rejects insufficient history and invalid indicator periods", () => {
  const short = assessIndicators(input({ candles: candles(4), asOf: "2026-11-06T03:10:00.000Z" }), policy);
  assert.equal(short.findings[0].code, "INSUFFICIENT_CANDLES");

  const invalid = assessIndicators(input({
    configuration: { smaPeriods: [1, 1], emaPeriods: [], rsiPeriods: [], atrPeriods: [] },
  }), policy);
  assert.equal(invalid.findings[0].code, "INVALID_CONFIGURATION");
});

test("returns incomplete when all supplied candles are still forming", () => {
  const forming = candles(5).map((candle) => ({ ...candle, isClosed: false }));
  const result = assessIndicators(input({ candles: forming }), policy);
  assert.equal(result.findings[0].code, "NO_CLOSED_CANDLES");
  assert.equal(result.assessment.formingCandlesExcluded, 5);
});
