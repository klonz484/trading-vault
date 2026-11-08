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

const { assessRiskPlan } = require("../src/lib/trading-brain/skills/risk-planning.ts");

const instrument = {
  symbol: "EURUSD", assetClass: "FOREX", baseAsset: "EUR", quoteAsset: "USD",
  pricePrecision: 5, tickSize: 0.00001, pipSize: 0.0001,
  contractSize: 100000, minimumLot: 0.01, lotStep: 0.01,
};
const instrumentAssessment = {
  symbol: "EURUSD", assetClass: "FOREX", metadataValid: true, quoteValid: true,
  quoteAgeSeconds: 1, spreadInPrice: 0.0001, spreadWithinPolicy: true,
  pipDefinition: "BROKER_DEFINED", limitations: [],
};
const policy = { minimumRiskReward: 1.5, requireAtLeastOneTarget: true, requireSourceProvenance: false };
const input = (overrides = {}) => ({
  plan: {
    symbol: "EURUSD", direction: "BUY",
    entry: { type: "LIMIT", low: 1.10000, high: 1.10020 },
    stopLoss: 1.09900, takeProfits: [1.10200, 1.10300],
  },
  instrument, instrumentAssessment, sourceReferences: [],
  ...overrides,
});

test("risk planner calculates conservative range-entry risk and target R multiples", () => {
  const result = assessRiskPlan(input(), policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.equal(result.assessment.planValid, true);
  assert.equal(result.assessment.entryWorstCase, 1.1002);
  assert.ok(Math.abs(result.assessment.riskDistance - 0.0012) < 1e-10);
  assert.ok(Math.abs(result.assessment.targets[0].riskReward - 1.5) < 1e-8);
  assert.equal(result.assessment.sizing, "NOT_CALCULATED");
});

test("risk planner supports sell geometry and conservative low entry", () => {
  const result = assessRiskPlan(input({
    plan: {
      symbol: "EURUSD", direction: "SELL",
      entry: { type: "LIMIT", low: 1.10000, high: 1.10020 },
      stopLoss: 1.10100, takeProfits: [1.09800],
    },
  }), { ...policy, minimumRiskReward: 1.9 });
  assert.equal(result.evidenceReadiness, "READY");
  assert.equal(result.assessment.entryWorstCase, 1.1);
  assert.ok(Math.abs(result.assessment.targets[0].riskReward - 2) < 1e-8);
});

test("missing policy or unready instrument fails closed", () => {
  assert.equal(assessRiskPlan(input()).status, "INCOMPLETE");
  const result = assessRiskPlan(input({ instrumentAssessment: { ...instrumentAssessment, spreadWithinPolicy: false } }), policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.assessment.planValid, false);
});

test("stop on the wrong side of the complete entry range is rejected", () => {
  const result = assessRiskPlan(input({
    plan: { ...input().plan, stopLoss: 1.10010 },
  }), policy);
  assert.equal(result.status, "REJECTED");
  assert.ok(result.findings.some((finding) => finding.code === "INVALID_STOP_GEOMETRY"));
});

test("targets must be correctly ordered and meet the explicit minimum R:R", () => {
  const reversed = assessRiskPlan(input({
    plan: { ...input().plan, takeProfits: [1.10200, 1.10150] },
  }), policy);
  assert.ok(reversed.findings.some((finding) => finding.code === "INVALID_TARGET_SEQUENCE"));

  const tooClose = assessRiskPlan(input({
    plan: { ...input().plan, takeProfits: [1.10100] },
  }), policy);
  assert.ok(tooClose.findings.some((finding) => finding.code === "TARGET_BELOW_MINIMUM_RR"));
});

test("symbol mismatch and missing required provenance are reported", () => {
  const mismatch = assessRiskPlan(input({
    plan: { ...input().plan, symbol: "XAUUSD" },
  }), policy);
  assert.equal(mismatch.status, "REJECTED");

  const provenance = assessRiskPlan(input(), { ...policy, requireSourceProvenance: true });
  assert.ok(provenance.findings.some((finding) => finding.code === "SOURCE_PROVENANCE_MISSING"));
  assert.equal(provenance.evidenceReadiness, "DEGRADED");
});

test("no account balance or pip value is required or inferred; sizing remains unavailable", () => {
  const result = assessRiskPlan(input(), policy);
  assert.equal(result.assessment.sizing, "NOT_CALCULATED");
  assert.ok(result.assessment.limitations.some((item) => item.includes("Position size")));
});

test("malformed or missing nested plan inputs fail closed instead of throwing", () => {
  const missingEntry = assessRiskPlan(input({
    plan: { ...input().plan, entry: null },
  }), policy);
  assert.equal(missingEntry.status, "REJECTED");
  assert.ok(missingEntry.findings.some((finding) => finding.code === "INVALID_PLAN"));

  const missingAssessment = assessRiskPlan(input({ instrumentAssessment: null }), policy);
  assert.equal(missingAssessment.status, "INCOMPLETE");
  assert.equal(missingAssessment.assessment.planValid, false);
});
