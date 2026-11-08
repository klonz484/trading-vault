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
const { validateConditionalScenario, monitorConditionalScenario } = require("../src/lib/trading-brain/conditional-scenarios.ts");

const scenario = {
  scenarioId: "scenario-1", track: "CURRENT", instrument: "EURUSD", timeframe: "M15",
  direction: "BUY", triggerRuleId: "mss-close-v1", triggerDescription: "Closed candle confirms the specified bullish break.",
  invalidationRuleId: "swing-low-break-v1", invalidationDescription: "Closed candle closes below the supplied invalidation level.",
  entryReference: 1.085, invalidationLevel: 1.08,
  createdAt: "2026-11-08T10:00:00.000Z", expiresAt: "2026-11-08T12:00:00.000Z",
  strategyId: "approved-strategy", strategyVersion: "1.2.0", methodologyVersion: "brain-methodology/1.0.0",
  sourceReferences: ["provider:broker-a:EURUSD:M15:latest"],
};
const evidence = {
  evidenceReadiness: "READY", livePriceAvailable: true, livePriceFresh: true,
  closedCandleConfirmed: true, conflictsResolved: true, collaborativeDecisionFinal: true,
  riskApproved: true, triggerConfirmed: true, sessionWindowOpen: true,
};

test("scenario validator accepts a complete caller-supplied conditional scenario", () => {
  assert.deepEqual(validateConditionalScenario(scenario), { prepared: true, findings: [] });
});

test("scenario validator rejects missing levels, provenance and invalid timestamps", () => {
  const result = validateConditionalScenario({ ...scenario, entryReference: null, sourceReferences: [], expiresAt: "invalid" });
  assert.equal(result.prepared, false);
  assert.ok(result.findings.some((finding) => finding.includes("entry reference")));
  assert.ok(result.findings.some((finding) => finding.includes("source reference")));
  assert.ok(result.findings.some((finding) => finding.includes("timestamps")));
});

test("BUY invalidation must be below the supplied entry reference", () => {
  const result = validateConditionalScenario({ ...scenario, invalidationLevel: 1.09 });
  assert.equal(result.prepared, false);
  assert.ok(result.findings.some((finding) => finding.includes("BUY scenario invalidation")));
});

test("current and session scenarios use separate lifecycle tracks and session windows", () => {
  const current = monitorConditionalScenario({
    scenario, status: "MONITORING", now: "2026-11-08T10:30:00.000Z",
    invalidationConfirmed: false, evidence,
  });
  assert.equal(current.track, "CURRENT");
  assert.equal(current.lifecycle.status, "ACTIVE");

  const session = monitorConditionalScenario({
    scenario: { ...scenario, scenarioId: "session-1", track: "SESSION" },
    status: "MONITORING", now: "2026-11-08T10:30:00.000Z",
    invalidationConfirmed: false, evidence: { ...evidence, sessionWindowOpen: false },
  });
  assert.equal(session.track, "SESSION");
  assert.equal(session.lifecycle.status, "MONITORING");
  assert.equal(session.lifecycle.activationEligible, false);
});

test("unprepared scenarios remain PREPARING and never activate", () => {
  const output = monitorConditionalScenario({
    scenario: { ...scenario, entryReference: null }, status: "MONITORING",
    now: "2026-11-08T10:30:00.000Z", invalidationConfirmed: false, evidence,
  });
  assert.equal(output.lifecycle.status, "PREPARING");
  assert.equal(output.lifecycle.activationEligible, false);
});
