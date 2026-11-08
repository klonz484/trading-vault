/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");

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

const { evaluateSignalLifecycle } = require("../src/lib/trading-brain/signal-lifecycle.ts");

const validEvidence = {
  evidenceReadiness: "READY",
  livePriceAvailable: true,
  livePriceFresh: true,
  closedCandleConfirmed: true,
  conflictsResolved: true,
  collaborativeDecisionFinal: true,
  riskApproved: true,
  triggerConfirmed: true,
  sessionWindowOpen: true,
};

const base = {
  track: "CURRENT",
  status: "MONITORING",
  scenarioPrepared: true,
  now: "2026-11-08T12:00:00.000Z",
  expiresAt: "2026-11-08T13:00:00.000Z",
  invalidationConfirmed: false,
  evidence: validEvidence,
};

test("a current signal activates only after every evidence and risk gate passes", () => {
  assert.deepEqual(evaluateSignalLifecycle(base), {
    status: "ACTIVE",
    changed: true,
    activationEligible: true,
    blockingReasons: [],
  });
});

test("missing live price or freshness blocks activation", () => {
  const result = evaluateSignalLifecycle({
    ...base,
    evidence: { ...validEvidence, livePriceAvailable: false, livePriceFresh: false },
  });
  assert.equal(result.status, "MONITORING");
  assert.equal(result.activationEligible, false);
  assert.ok(result.blockingReasons.some((reason) => reason.includes("live price is unavailable")));
  assert.ok(result.blockingReasons.some((reason) => reason.includes("not confirmed fresh")));
});

test("a session scenario must be prepared and monitored before it can activate", () => {
  const result = evaluateSignalLifecycle({
    ...base,
    track: "SESSION",
    status: "PREPARING",
  });
  assert.equal(result.status, "MONITORING");
  assert.equal(result.changed, true);
  assert.equal(result.activationEligible, false);
  assert.ok(result.blockingReasons.some((reason) => reason.includes("monitoring must begin")));
});

test("session signals cannot activate outside their planned session window", () => {
  const result = evaluateSignalLifecycle({
    ...base,
    track: "SESSION",
    evidence: { ...validEvidence, sessionWindowOpen: false },
  });
  assert.equal(result.status, "MONITORING");
  assert.ok(result.blockingReasons.some((reason) => reason.includes("activation window is not open")));
});

test("an active signal is suspended when a required evidence gate is lost", () => {
  const result = evaluateSignalLifecycle({
    ...base,
    status: "ACTIVE",
    evidence: { ...validEvidence, evidenceReadiness: "STALE" },
  });
  assert.equal(result.status, "SUSPENDED");
  assert.equal(result.changed, true);
  assert.equal(result.activationEligible, false);
});

test("an invalidation event closes the signal before other gates are evaluated", () => {
  const result = evaluateSignalLifecycle({
    ...base,
    status: "ACTIVE",
    invalidationConfirmed: true,
    evidence: { ...validEvidence, evidenceReadiness: "UNAVAILABLE" },
  });
  assert.equal(result.status, "INVALIDATED");
  assert.equal(result.changed, true);
});

test("expired scenarios cannot activate", () => {
  const result = evaluateSignalLifecycle({
    ...base,
    now: "2026-11-08T13:00:00.000Z",
  });
  assert.equal(result.status, "EXPIRED");
  assert.equal(result.activationEligible, false);
});

test("terminal signal states cannot be reactivated", () => {
  for (const status of ["INVALIDATED", "EXPIRED", "CANCELLED"]) {
    const result = evaluateSignalLifecycle({ ...base, status });
    assert.equal(result.status, status);
    assert.equal(result.activationEligible, false);
    assert.equal(result.changed, false);
  }
});

test("unresolved conflicts, non-final collaboration and failed risk checks each block activation", () => {
  for (const evidence of [
    { ...validEvidence, conflictsResolved: false },
    { ...validEvidence, collaborativeDecisionFinal: false },
    { ...validEvidence, riskApproved: false },
    { ...validEvidence, triggerConfirmed: false },
    { ...validEvidence, closedCandleConfirmed: false },
  ]) {
    const result = evaluateSignalLifecycle({ ...base, evidence });
    assert.equal(result.status, "MONITORING");
    assert.equal(result.activationEligible, false);
    assert.ok(result.blockingReasons.length > 0);
  }
});

test("invalid timestamps fail closed without changing the current status", () => {
  const result = evaluateSignalLifecycle({ ...base, now: "not-a-date" });
  assert.equal(result.status, "MONITORING");
  assert.equal(result.activationEligible, false);
  assert.ok(result.blockingReasons.some((reason) => reason.includes("Valid ISO timestamps")));
});
