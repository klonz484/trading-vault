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

const { assessMarketStructure } = require("../src/lib/trading-brain/skills/market-structure.ts");

const candles = [
  ["10:00", 1.1000, 1.1010, 1.0990, 1.1005],
  ["11:00", 1.1020, 1.1040, 1.0980, 1.1030],
  ["12:00", 1.1010, 1.1020, 1.0970, 1.1015],
  ["13:00", 1.1000, 1.1030, 1.0950, 1.1010],
  ["14:00", 1.1030, 1.1050, 1.0960, 1.1040],
  ["15:00", 1.1020, 1.1030, 1.0970, 1.1025],
  ["16:00", 1.1060, 1.1070, 1.0980, 1.1060],
].map(([time, open, high, low, close]) => ({
  timestamp: `2026-11-06T${time}:00.000Z`,
  instrument: "EURUSD",
  timeframe: "H1",
  open,
  high,
  low,
  close,
  isClosed: true,
}));

const input = (overrides = {}) => ({
  instrument: "EURUSD",
  timeframe: "H1",
  candles,
  evidenceGate: { status: "COMPLETE", evidenceReadiness: "READY" },
  sourceReferences: [{
    sourceId: "test-snapshot",
    providerId: "test-provider",
    observedAt: "2026-11-06T16:00:00.000Z",
    receivedAt: "2026-11-06T16:00:01.000Z",
    instrument: "EURUSD",
    timeframe: "H1",
  }],
  ...overrides,
});

const policy = {
  leftBars: 1,
  rightBars: 1,
  minimumSwingDistanceBars: 1,
  breakBuffer: 0.0001,
  equalExtremePolicy: "REJECT",
  requireClosedCandleForConfirmation: true,
};

test("requires an explicit policy instead of guessing swing thresholds", () => {
  const result = assessMarketStructure(input());
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.findings[0].code, "POLICY_MISSING");
});

test("blocks structure analysis when upstream evidence is not READY", () => {
  const result = assessMarketStructure(input({
    evidenceGate: { status: "INCOMPLETE", evidenceReadiness: "STALE" },
  }), policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.findings[0].code, "EVIDENCE_NOT_READY");
});

test("detects confirmed local swings and a close beyond the latest swing high", () => {
  const result = assessMarketStructure(input(), policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.ok(result.assessment.swings.some((swing) => swing.kind === "HIGH" && swing.price === 1.105));
  assert.equal(result.assessment.latestBreak.direction, "BULLISH");
  assert.equal(result.assessment.latestBreak.level, 1.105);
  assert.equal(result.assessment.latestBreak.confirmation, "CONFIRMED_CLOSED_CANDLE");
});

test("forming candles are excluded from confirmed structure", () => {
  const forming = {
    ...candles[candles.length - 1],
    timestamp: "2026-11-06T17:00:00.000Z",
    high: 1.1200,
    close: 1.1190,
    isClosed: false,
  };
  const result = assessMarketStructure(input({ candles: [...candles, forming] }), policy);
  assert.ok(result.findings.some((finding) => finding.code === "PROVISIONAL_CANDLE_IGNORED"));
  assert.equal(result.assessment.latestBreak.candleTimestamp, candles[candles.length - 1].timestamp);
  assert.notEqual(result.assessment.latestBreak.candleClose, forming.close);
});

test("rejects duplicate or unordered closed candle timestamps", () => {
  const invalid = [...candles];
  invalid[2] = { ...invalid[2], timestamp: invalid[1].timestamp };
  const result = assessMarketStructure(input({ candles: invalid }), policy);
  assert.equal(result.status, "REJECTED");
  assert.ok(result.findings.some((finding) => finding.code === "INVALID_CANDLE_SEQUENCE"));
});
