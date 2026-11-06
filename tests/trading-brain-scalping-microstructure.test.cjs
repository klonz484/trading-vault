/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename }).outputText, filename);
};
const { assessScalpingMicrostructure } = require("../src/lib/trading-brain/skills/scalping/microstructure.ts");
const base = {
  symbol: "EURUSD", venueId: "broker-a", asOf: "2026-11-06T12:00:02.000Z", tickSize: 0.0001,
  sequenceComplete: true, upstreamEvidenceReady: true,
  sourceReferences: [{ sourceId: "book-1", providerId: "broker-a", observedAt: "2026-11-06T12:00:01.000Z", receivedAt: "2026-11-06T12:00:01.100Z", instrument: "EURUSD", timeframe: "orderbook" }],
  snapshots: [{ sequence: 1, timestamp: "2026-11-06T12:00:01.000Z", instrument: "EURUSD", venueId: "broker-a",
    bids: [{ price: 1.1, size: 4 }, { price: 1.0999, size: 3 }],
    asks: [{ price: 1.1001, size: 2 }, { price: 1.1002, size: 1 }] }],
};
const policy = { minimumSnapshots: 1, requiredDepthLevels: 2, maximumSnapshotAgeSeconds: 3, maximumInterSnapshotGapSeconds: 2, maximumSpreadTicks: 2, requireSourceProvenance: true };

test("summarizes venue-specific displayed depth and spread", () => {
  const result = assessScalpingMicrostructure(base, policy);
  assert.equal(result.status, "COMPLETE");
  assert.ok(Math.abs(result.assessment.spreadTicks - 1) < 1e-10);
  assert.equal(result.assessment.displayedBidDepth, 7);
  assert.equal(result.assessment.displayedAskDepth, 3);
  assert.equal(result.assessment.depthImbalance, 0.4);
});

test("blocks when upstream evidence gate is not ready", () => {
  const result = assessScalpingMicrostructure({ ...base, upstreamEvidenceReady: false }, policy);
  assert.equal(result.status, "INCOMPLETE");
});

test("blocks incomplete sequence, stale snapshot and missing provenance", () => {
  assert.equal(assessScalpingMicrostructure({ ...base, sequenceComplete: false }, policy).status, "INCOMPLETE");
  assert.equal(assessScalpingMicrostructure({ ...base, asOf: "2026-11-06T12:01:00.000Z" }, policy).status, "INCOMPLETE");
  assert.equal(assessScalpingMicrostructure({ ...base, sourceReferences: [] }, policy).status, "INCOMPLETE");
});

test("rejects crossed, misordered and insufficient books", () => {
  const crossed = { ...base, snapshots: [{ ...base.snapshots[0], asks: [{ price: 1.0999, size: 2 }, { price: 1.1002, size: 1 }] }] };
  assert.equal(assessScalpingMicrostructure(crossed, policy).status, "INCOMPLETE");
  const shallow = { ...base, snapshots: [{ ...base.snapshots[0], bids: [{ price: 1.1, size: 4 }] }] };
  assert.equal(assessScalpingMicrostructure(shallow, policy).status, "INCOMPLETE");
});

test("does not invent consolidated liquidity or trade signals", () => {
  const result = assessScalpingMicrostructure(base, policy);
  assert.deepEqual(result.interpretations, []);
  assert.ok(result.uncertainties.some((item) => item.includes("consolidated spot-Forex")));
});
