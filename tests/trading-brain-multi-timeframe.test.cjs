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

const { assessMultiTimeframe } = require("../src/lib/trading-brain/skills/multi-timeframe.ts");

const source = (timeframe, at) => ({
  sourceId: `snapshot-${timeframe}`,
  providerId: "test-provider",
  observedAt: at,
  receivedAt: at,
  instrument: "EURUSD",
  timeframe,
});
const snapshot = (timeframe, bias, at = "2026-11-06T12:00:00.000Z", gate = {
  status: "COMPLETE",
  evidenceReadiness: "READY",
}) => ({
  timeframe,
  latestClosedCandleAt: at,
  evidenceGate: gate,
  structureBias: bias,
  sourceReferences: [source(timeframe, at)],
});
const input = (overrides = {}) => ({
  instrument: "EURUSD",
  requestedTimeframes: ["H4", "H1", "M15"],
  asOf: "2026-11-06T12:01:00.000Z",
  snapshots: [
    snapshot("H4", "BULLISH"),
    snapshot("H1", "BULLISH"),
    snapshot("M15", "BULLISH"),
  ],
  ...overrides,
});
const policy = {
  timeframePriority: ["H4", "H1", "M15"],
  maximumTimestampSkewSeconds: 3600,
  requireAllRequestedTimeframes: true,
};

test("requires explicit timeframe priority and synchronization policy", () => {
  const result = assessMultiTimeframe(input());
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.findings[0].code, "POLICY_MISSING");
});

test("recognizes fully aligned directional timeframe structure", () => {
  const result = assessMultiTimeframe(input(), policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.equal(result.assessment.alignment, "FULLY_ALIGNED");
  assert.equal(result.assessment.dominantHigherTimeframeBias, "BULLISH");
  assert.deepEqual(result.assessment.orderedContext.map((item) => item.timeframe), ["H4", "H1", "M15"]);
});

test("preserves directional conflict instead of forcing a consensus", () => {
  const result = assessMultiTimeframe(input({
    snapshots: [
      snapshot("H4", "BULLISH"),
      snapshot("H1", "BEARISH"),
      snapshot("M15", "BULLISH"),
    ],
  }), policy);
  assert.equal(result.assessment.alignment, "DIRECTIONAL_CONFLICT");
  assert.ok(result.findings.some((finding) => finding.code === "DIRECTIONAL_CONFLICT"));
});

test("does not invent missing timeframe context", () => {
  const result = assessMultiTimeframe(input({
    snapshots: [snapshot("H4", "BULLISH"), snapshot("H1", "BULLISH")],
  }), policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.deepEqual(result.assessment.missingTimeframes, ["M15"]);
});

test("blocks reconciliation when any timeframe evidence gate is not READY", () => {
  const result = assessMultiTimeframe(input({
    snapshots: [
      snapshot("H4", "BULLISH"),
      snapshot("H1", "BULLISH", undefined, { status: "INCOMPLETE", evidenceReadiness: "STALE" }),
      snapshot("M15", "BULLISH"),
    ],
  }), policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.ok(result.findings.some((finding) => finding.code === "EVIDENCE_NOT_READY"));
});

test("rejects timestamp skew beyond the explicit policy", () => {
  const result = assessMultiTimeframe(input({
    snapshots: [
      snapshot("H4", "BULLISH", "2026-11-06T10:00:00.000Z"),
      snapshot("H1", "BULLISH", "2026-11-06T12:00:00.000Z"),
      snapshot("M15", "BULLISH", "2026-11-06T12:00:00.000Z"),
    ],
  }), policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.ok(result.findings.some((finding) => finding.code === "TIMESTAMP_SKEW_EXCEEDED"));
});

test("marks range and unclear structure as mixed rather than directional agreement", () => {
  const result = assessMultiTimeframe(input({
    snapshots: [
      snapshot("H4", "BULLISH"),
      snapshot("H1", "RANGE_OR_UNCLEAR"),
      snapshot("M15", "BULLISH"),
    ],
  }), policy);
  assert.equal(result.assessment.alignment, "MIXED_OR_RANGE");
});

test("rejects duplicated requested timeframes and duplicate snapshots", () => {
  const duplicatedRequest = assessMultiTimeframe(input({
    requestedTimeframes: ["H4", "H4"],
  }), policy);
  assert.equal(duplicatedRequest.status, "REJECTED");

  const duplicatedSnapshot = assessMultiTimeframe(input({
    snapshots: [
      snapshot("H4", "BULLISH"),
      snapshot("H4", "BEARISH"),
      snapshot("H1", "BULLISH"),
      snapshot("M15", "BULLISH"),
    ],
  }), policy);
  assert.equal(duplicatedSnapshot.status, "REJECTED");
});
