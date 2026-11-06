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

const { assessScalpingContext } = require("../src/lib/trading-brain/skills/scalping/context.ts");

const asOf = "2026-11-06T12:00:00.000Z";
const ref = {
  sourceId: "feed-1", providerId: "provider-1", observedAt: asOf, receivedAt: asOf,
  instrument: "EURUSD", timeframe: "tick",
};
const input = {
  instrument: "EURUSD",
  instrumentCurrencies: ["EUR", "USD"],
  asOf,
  sessions: [{ id: "london", name: "London", phase: "OVERLAP", observedAt: asOf, sourceReferences: [ref] }],
  events: [{
    id: "event-1", title: "Scheduled release", startsAt: "2026-11-06T12:05:00.000Z",
    endsAt: "2026-11-06T12:10:00.000Z", impact: "HIGH", currencies: ["USD"], sourceReferences: [ref],
  }],
  volatility: [{
    id: "vol-1", instrument: "EURUSD", timeframe: "1m", observedAt: asOf,
    metricName: "range", value: 2, baseline: 1, unit: "ticks", sourceReferences: [ref],
  }],
  correlations: [{
    id: "corr-1", instrument: "EURUSD", comparisonInstrument: "DXY", observedAt: asOf,
    window: "30m", coefficient: -0.7, sourceReferences: [ref],
  }],
};
const policy = {
  maximumObservationAgeSeconds: 60,
  upcomingEventHorizonSeconds: 600,
  elevatedVolatilityRatio: 1.5,
  requireProvenance: true,
};

test("scalping context requires explicit policy and supplied session observations", () => {
  assert.equal(assessScalpingContext(input).status, "INCOMPLETE");
  const noSessions = assessScalpingContext({ ...input, sessions: [] }, policy);
  assert.equal(noSessions.status, "INCOMPLETE");
  assert.equal(noSessions.findings[0].code, "SESSION_DATA_MISSING");
});

test("summarizes sourced session, event, volatility and correlation context", () => {
  const result = assessScalpingContext(input, policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.equal(result.assessment.sessionState, "OBSERVED");
  assert.equal(result.assessment.sessionPhases[0].phase, "OVERLAP");
  assert.equal(result.assessment.relevantEvents[0].state, "UPCOMING");
  assert.equal(result.assessment.volatility[0].state, "ELEVATED");
  assert.equal(result.assessment.correlations[0].coefficient, -0.7);
});

test("stale and unprovenanced observations degrade the assessment", () => {
  const stale = { ...input, volatility: [{ ...input.volatility[0], observedAt: "2026-11-06T11:00:00.000Z" }] };
  const staleResult = assessScalpingContext(stale, policy);
  assert.equal(staleResult.status, "INCOMPLETE");
  assert.ok(staleResult.findings.some((finding) => finding.code === "OBSERVATION_STALE"));

  const unprovenanced = { ...input, sessions: [{ ...input.sessions[0], sourceReferences: [] }] };
  const provenanceResult = assessScalpingContext(unprovenanced, policy);
  assert.equal(provenanceResult.status, "INCOMPLETE");
  assert.ok(provenanceResult.findings.some((finding) => finding.code === "PROVENANCE_MISSING"));
});

test("does not infer missing event coverage or turn context into trade instructions", () => {
  const result = assessScalpingContext({ ...input, events: [] }, policy);
  assert.ok(result.uncertainties.some((item) => item.includes("does not establish that no event risk exists")));
  assert.deepEqual(result.assessment.relevantEvents, []);
  assert.ok(result.limitations.some((item) => item.includes("does not generate BUY, SELL")));
  assert.equal(result.assessment.sessionState, "OBSERVED");
});
