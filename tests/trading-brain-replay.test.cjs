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
const { replayClosedCandles } = require("../src/lib/trading-brain/replay.ts");

const candles = [
  { timestamp: "2026-11-08T10:00:00.000Z", open: 1.1, high: 1.12, low: 1.09, close: 1.11, provisional: false },
  { timestamp: "2026-11-08T10:15:00.000Z", open: 1.11, high: 1.13, low: 1.1, close: 1.12, provisional: true },
  { timestamp: "2026-11-08T10:30:00.000Z", open: 1.12, high: 1.14, low: 1.11, close: 1.13, provisional: false },
];

function noTradeStrategy({ asOf, history }) {
  return {
    action: "NO_TRADE",
    ruleSetVersion: "test-rules/1.0.0",
    rationale: "Test replay only.",
    sourceTimestamps: [history[history.length - 1].timestamp],
  };
}

test("replay exposes only the chronological prefix ending at each closed candle", () => {
  const seen = [];
  const result = replayClosedCandles({
    candles,
    strategy: ({ asOf, history }) => {
      seen.push({ asOf, timestamps: history.map((candle) => candle.timestamp) });
      return noTradeStrategy({ asOf, history });
    },
  });
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.includedCandleCount, 2);
  assert.equal(result.excludedProvisionalCount, 1);
  assert.deepEqual(seen, [
    { asOf: "2026-11-08T10:00:00.000Z", timestamps: ["2026-11-08T10:00:00.000Z"] },
    { asOf: "2026-11-08T10:30:00.000Z", timestamps: ["2026-11-08T10:00:00.000Z", "2026-11-08T10:30:00.000Z"] },
  ]);
});

test("replay rejects future or unavailable source timestamps", () => {
  const result = replayClosedCandles({
    candles,
    strategy: ({ asOf }) => ({
      action: "BUY_CANDIDATE",
      ruleSetVersion: "test-rules/1.0.0",
      rationale: "Deliberately invalid future reference.",
      sourceTimestamps: ["2026-11-08T10:30:00.000Z"],
    }),
  });
  assert.equal(result.status, "REJECTED");
  assert.match(result.findings[0], /future evidence|unavailable/i);
});

test("replay rejects duplicate and out-of-order candles", () => {
  const result = replayClosedCandles({
    candles: [candles[2], candles[0]],
    strategy: noTradeStrategy,
  });
  assert.equal(result.status, "REJECTED");
  assert.match(result.findings[0], /strictly chronological/i);
});

test("replay rejects invalid OHLC and invalid time boundaries", () => {
  const invalid = replayClosedCandles({
    candles: [{ ...candles[0], high: 1.0 }],
    strategy: noTradeStrategy,
  });
  assert.equal(invalid.status, "REJECTED");
  assert.match(invalid.findings[0], /invalid state or OHLC/i);

  const badRange = replayClosedCandles({
    candles,
    startAt: "2026-11-08T11:00:00.000Z",
    endAt: "2026-11-08T10:00:00.000Z",
    strategy: noTradeStrategy,
  });
  assert.equal(badRange.status, "REJECTED");
});

test("replay stops safely when a strategy throws or returns incomplete evidence", () => {
  const failed = replayClosedCandles({
    candles,
    strategy: () => { throw new Error("test failure"); },
  });
  assert.equal(failed.status, "INCOMPLETE");
  assert.equal(failed.records.length, 0);

  const incomplete = replayClosedCandles({
    candles,
    strategy: () => ({
      action: "NO_TRADE",
      ruleSetVersion: "",
      rationale: "",
      sourceTimestamps: [],
    }),
  });
  assert.equal(incomplete.status, "INCOMPLETE");
});
