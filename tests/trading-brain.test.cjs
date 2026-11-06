/* global require, module */
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

const { resolveCollaborativeDecision } = require("../src/lib/trading-brain/collaboration.ts");

function assessment(system, overrides = {}) {
  return {
    system,
    status: "COMPLETE",
    decision: "BUY",
    tradePlan: {
      orderType: "PENDING",
      entryType: "range",
      entryLow: 1.1,
      entryHigh: 1.101,
      stopLoss: 1.09,
      takeProfit1: 1.12,
      invalidation: 1.09,
    },
    rationale: "Independent assessment rationale.",
    observations: ["Observed structure."],
    interpretations: ["Interpretation."],
    supportingEvidence: ["Supporting evidence."],
    contraryEvidence: [],
    uncertainties: ["Candle close not confirmed."],
    methodologyVersion: "test-1",
    modelProvenance: "deterministic-test",
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    contractVersion: "1.0.0",
    analysisId: "analysis-test-1",
    instrument: "EURUSD",
    timeframe: "H1",
    createdAt: "2026-11-06T12:00:00.000Z",
    evidenceReadiness: "READY",
    sourceReferences: ["scanner:test"],
    limitations: [],
    scanner: assessment("SCANNER"),
    brain: assessment("BRAIN"),
    ...overrides,
  };
}

test("approves only matching independent plans with READY evidence", () => {
  const result = resolveCollaborativeDecision(request());
  assert.equal(result.decision, "BUY");
  assert.equal(result.decisionStatus, "FINAL");
  assert.equal(result.agreementState, "AGREED");
});

test("blocks directional approval when Scanner and Brain disagree", () => {
  const result = resolveCollaborativeDecision(request({
    brain: assessment("BRAIN", { decision: "SELL" }),
  }));
  assert.equal(result.decision, "NO_TRADE");
  assert.equal(result.agreementState, "DISAGREED");
  assert.ok(result.conflicts.length > 0);
});

test("does not treat a missing Brain assessment as approval", () => {
  const result = resolveCollaborativeDecision(request({
    brain: assessment("BRAIN", { status: "UNAVAILABLE" }),
  }));
  assert.equal(result.decision, "NO_TRADE");
  assert.equal(result.decisionStatus, "DEGRADED");
  assert.equal(result.agreementState, "SCANNER_ONLY");
});

test("does not average or silently combine different plan levels", () => {
  const result = resolveCollaborativeDecision(request({
    brain: assessment("BRAIN", {
      tradePlan: {
        orderType: "PENDING",
        entryType: "range",
        entryLow: 1.105,
        entryHigh: 1.106,
        stopLoss: 1.095,
        takeProfit1: 1.125,
        invalidation: 1.095,
      },
    }),
  }));
  assert.equal(result.decision, "NO_TRADE");
  assert.equal(result.agreementState, "DISAGREED");
});

test("blocks a directional decision when market-data readiness is not READY", () => {
  const result = resolveCollaborativeDecision(request({ evidenceReadiness: "DEGRADED" }));
  assert.equal(result.decision, "NO_TRADE");
  assert.equal(result.decisionStatus, "DEGRADED");
  assert.equal(result.agreementState, "INSUFFICIENT_EVIDENCE");
});
