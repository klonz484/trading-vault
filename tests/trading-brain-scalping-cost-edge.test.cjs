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

const { assessScalpingCostEdge } = require("../src/lib/trading-brain/skills/scalping/cost-aware-edge.ts");

const sourceReferences = [{
  sourceId: "broker-quote",
  providerId: "broker-a",
  observedAt: "2026-11-06T12:00:00.000Z",
  receivedAt: "2026-11-06T12:00:00.010Z",
  instrument: "EURUSD",
  timeframe: "TICK",
}];
const base = {
  instrument: "EURUSD",
  timeframe: "TICK",
  asOf: "2026-11-06T12:00:00.100Z",
  quote: {
    instrument: "EURUSD",
    bid: 1.1000,
    ask: 1.1001,
    observedAt: "2026-11-06T12:00:00.000Z",
    receivedAt: "2026-11-06T12:00:00.010Z",
    sourceId: "broker-quote",
    providerId: "broker-a",
  },
  grossEdge: 0.0010,
  costs: {
    commissionRoundTrip: 0.0001,
    feesRoundTrip: 0,
    slippageMinimum: 0.00005,
    slippageMaximum: 0.0001,
    conversionVerified: true,
    scheduleVerified: true,
  },
  policy: { maximumQuoteAgeSeconds: 2, minimumEdgeToCostRatio: 2 },
  evidenceGate: { status: "COMPLETE", evidenceReadiness: "READY" },
  sourceReferences,
};

test("requires explicit policy and complete READY evidence", () => {
  const withoutPolicy = { ...base };
  delete withoutPolicy.policy;
  assert.equal(assessScalpingCostEdge(withoutPolicy).findings[0].code, "POLICY_MISSING");
  assert.equal(assessScalpingCostEdge({ ...base, evidenceGate: { status: "INCOMPLETE", evidenceReadiness: "INCOMPLETE" } }).findings[0].code, "EVIDENCE_NOT_READY");
  assert.equal(assessScalpingCostEdge({ ...base, policy: { ...base.policy, minimumEdgeToCostRatio: 0 } }).findings[0].code, "INVALID_POLICY");
});

test("calculates spread, known costs, conservative net edge and edge-to-cost ratio", () => {
  const result = assessScalpingCostEdge(base);
  assert.equal(result.status, "COMPLETE");
  assert.ok(Math.abs(result.assessment.quoteSpread - 0.0001) < 1e-12);
  assert.ok(Math.abs(result.assessment.knownRoundTripCosts - 0.0002) < 1e-12);
  assert.ok(Math.abs(result.assessment.totalCostMaximum - 0.0003) < 1e-12);
  assert.ok(Math.abs(result.assessment.netEdgeMinimum - 0.0007) < 1e-12);
  assert.ok(result.assessment.passesConfiguredCostGate);
});

test("does not pass when conservative net edge or configured ratio fails", () => {
  const noNetEdge = assessScalpingCostEdge({ ...base, grossEdge: 0.0002 });
  assert.equal(noNetEdge.findings[0].code, "EDGE_DOES_NOT_CLEAR_COSTS");
  assert.equal(noNetEdge.assessment.passesConfiguredCostGate, false);
  const ratioFail = assessScalpingCostEdge({ ...base, policy: { ...base.policy, minimumEdgeToCostRatio: 5 } });
  assert.equal(ratioFail.findings[0].code, "EDGE_DOES_NOT_CLEAR_COSTS");
});

test("blocks unverified conversions and unverified commission/fee schedules", () => {
  assert.equal(assessScalpingCostEdge({ ...base, costs: { ...base.costs, conversionVerified: false } }).findings[0].code, "COST_CONVERSION_UNVERIFIED");
  assert.equal(assessScalpingCostEdge({ ...base, costs: { ...base.costs, scheduleVerified: false } }).findings[0].code, "COST_SCHEDULE_UNVERIFIED");
});

test("rejects invalid quote, gross edge, costs, timestamps and stale quotes", () => {
  assert.equal(assessScalpingCostEdge({ ...base, quote: { ...base.quote, ask: 1.0999 } }).findings[0].code, "INVALID_QUOTE");
  assert.equal(assessScalpingCostEdge({ ...base, grossEdge: 0 }).findings[0].code, "INVALID_GROSS_EDGE");
  assert.equal(assessScalpingCostEdge({ ...base, costs: { ...base.costs, slippageMaximum: -1 } }).findings[0].code, "INVALID_COST_INPUT");
  assert.equal(assessScalpingCostEdge({ ...base, asOf: "2026-11-06T12:00:00" }).findings[0].code, "INVALID_TIMESTAMP");
  assert.equal(assessScalpingCostEdge({ ...base, asOf: "2026-11-06T12:01:00.000Z" }).findings[0].code, "STALE_QUOTE");
});

test("requires quote and source identity to match the requested instrument and timeframe", () => {
  assert.equal(assessScalpingCostEdge({ ...base, quote: { ...base.quote, instrument: "XAUUSD" } }).findings[0].code, "SOURCE_IDENTITY_MISMATCH");
  assert.equal(assessScalpingCostEdge({ ...base, sourceReferences: [{ ...sourceReferences[0], timeframe: "H1" }] }).findings[0].code, "SOURCE_IDENTITY_MISMATCH");
});

test("reports calculations only and never creates a trading recommendation", () => {
  const result = assessScalpingCostEdge(base);
  assert.deepEqual(result.interpretations, []);
  assert.ok(result.limitations.some((item) => item.includes("not a trade signal")));
  assert.ok(!("decision" in result));
  assert.ok(!("order" in result));
});
