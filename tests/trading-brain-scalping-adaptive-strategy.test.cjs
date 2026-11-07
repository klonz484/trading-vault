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

const { assessScalpingStrategySuitability } = require("../src/lib/trading-brain/skills/scalping/adaptive-strategy.ts");

const asOf = "2026-11-06T12:00:00.000Z";
const ref = {
  sourceId: "research-feed", providerId: "provider-1", observedAt: asOf, receivedAt: asOf,
  instrument: "EURUSD", timeframe: "tick",
};
const candidate = (overrides = {}) => ({
  id: "momentum-v1", name: "Momentum v1", type: "MOMENTUM", version: "1.0.0",
  compatibleRegimes: ["TRENDING", "HIGH_MOMENTUM"],
  evaluation: {
    sampleSize: 250, outOfSample: true, netEdgeAfterCosts: 0.8,
    maximumDrawdown: 4, costGatePassed: true, evaluatedAt: asOf,
  },
  sourceReferences: [ref],
  ...overrides,
});
const input = {
  instrument: "EURUSD", timeframe: "tick", asOf,
  observedRegimes: ["TRENDING"],
  candidates: [candidate()],
  contextReady: true, costAssessmentReady: true,
  sourceReferences: [ref],
};
const policy = {
  minimumOutOfSampleTrades: 100,
  minimumNetEdgeAfterCosts: 0.2,
  maximumPermittedDrawdown: 8,
  maximumEvidenceAgeSeconds: 3600,
  allowMarketMakingResearch: false,
  requireProvenance: true,
};

test("requires explicit policy, context, and verified cost assessment", () => {
  assert.equal(assessScalpingStrategySuitability(input).status, "INCOMPLETE");
  assert.equal(assessScalpingStrategySuitability({ ...input, contextReady: false }, policy).findings[0].code, "CONTEXT_NOT_READY");
  assert.equal(assessScalpingStrategySuitability({ ...input, costAssessmentReady: false }, policy).findings[0].code, "COST_ASSESSMENT_NOT_READY");
});

test("marks candidates suitable for further research only when every explicit gate passes", () => {
  const result = assessScalpingStrategySuitability(input, policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.equal(result.assessment.candidates[0].status, "SUITABLE_FOR_RESEARCH");
  assert.equal(result.assessment.liveStrategySwitching, false);
  assert.equal(result.assessment.selectedLiveStrategy, null);
});

test("preserves regime mismatch and failed research gates without choosing a winner", () => {
  const result = assessScalpingStrategySuitability({
    ...input,
    observedRegimes: ["RANGE_BOUND"],
    candidates: [candidate({ evaluation: { ...candidate().evaluation, costGatePassed: false } })],
  }, policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.assessment.candidates[0].status, "NOT_SUPPORTED_BY_CONTEXT");
  assert.ok(result.assessment.candidates[0].reasons.includes("Verified cost gate did not pass."));
  assert.equal(result.assessment.selectedLiveStrategy, null);
});

test("keeps market-making research-only and rejects stale evaluation evidence", () => {
  const marketMaking = candidate({ id: "mm-v1", type: "MARKET_MAKING" });
  const result = assessScalpingStrategySuitability({ ...input, candidates: [marketMaking] }, {
    ...policy, allowMarketMakingResearch: true,
  });
  assert.equal(result.assessment.candidates[0].status, "RESEARCH_ONLY");

  const stale = candidate({ evaluation: { ...candidate().evaluation, evaluatedAt: "2026-11-06T09:00:00.000Z" } });
  const staleResult = assessScalpingStrategySuitability({ ...input, candidates: [stale] }, policy);
  assert.equal(staleResult.status, "INCOMPLETE");
  assert.ok(staleResult.findings.some((finding) => finding.code === "EVIDENCE_STALE"));
});

test("requires matching provenance and never emits trade or execution instructions", () => {
  const mismatched = { ...ref, instrument: "GBPUSD" };
  const result = assessScalpingStrategySuitability({
    ...input, candidates: [candidate({ sourceReferences: [mismatched] })],
  }, policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.ok(result.findings.some((finding) => finding.code === "PROVENANCE_MISSING"));
  assert.ok(result.limitations.some((item) => item.includes("not a trade signal")));
  assert.equal(result.assessment.selectedLiveStrategy, null);
});
