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
const { assessHierarchicalMarketStructure } = require("../src/lib/trading-brain/hierarchical-structure.ts");

const candles = Array.from({ length: 40 }, (_, index) => {
  const center = 1.1 + Math.sin(index * Math.PI / 3) * 0.004;
  return {
    timestamp: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(),
    instrument: "EURUSD", timeframe: "M15",
    open: center - 0.0002, high: center + 0.001, low: center - 0.001,
    close: center + 0.0002, isClosed: true,
  };
});
const input = {
  instrument: "EURUSD", timeframe: "M15", candles,
  evidenceGate: { status: "COMPLETE", evidenceReadiness: "READY" },
  sourceReferences: [{
    sourceId: "snapshot-1", providerId: "broker-a",
    observedAt: "2026-11-01T09:45:00.000Z", receivedAt: "2026-11-01T09:46:00.000Z",
    instrument: "EURUSD", timeframe: "M15",
  }],
};
const policy = {
  internalMinimumSwingDistanceBars: 2,
  externalMinimumSwingDistanceBars: 5,
  breakBuffer: 0,
  equalExtremePolicy: "REJECT",
};

test("hierarchical structure requires explicit calibration policy", () => {
  const result = assessHierarchicalMarketStructure(input);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.assessment.primaryBias, "RANGE_OR_UNCLEAR");
  assert.ok(result.findings.some((finding) => finding.code === "POLICY_MISSING"));
});

test("hierarchical structure blocks when upstream evidence is not READY", () => {
  const result = assessHierarchicalMarketStructure({
    ...input, evidenceGate: { status: "INCOMPLETE", evidenceReadiness: "UNAVAILABLE" },
  }, policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.evidenceReadiness, "INCOMPLETE");
});

test("internal and external structures are calculated and retained separately", () => {
  const result = assessHierarchicalMarketStructure(input, policy);
  assert.equal(result.skillId, "hierarchical-market-structure");
  assert.ok(result.assessment.internal);
  assert.ok(result.assessment.external);
  assert.equal(result.assessment.primaryBias, result.assessment.external.bias);
  assert.equal(result.assessment.internalChallenge === "NONE", !result.assessment.conflict);
  assert.ok(result.limitations.some((limitation) => limitation.includes("cannot independently reverse")));
});
