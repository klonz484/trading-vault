const test = require("node:test");
const {
  assert,
  evidence,
  bundle,
  scenario,
  scoreEvidenceBundle,
  transitionScenario,
  validateScenario,
} = require("./fixtures.cjs");

test("confirmed valid evidence receives four times provisional weight", () => {
  const score = scoreEvidenceBundle(bundle([
    evidence({ evidenceId: "confirmed-bull" }),
    evidence({
      evidenceId: "provisional-bull",
      state: "provisional",
      confirmedAt: undefined,
    }),
  ]));
  assert.equal(score.valid, true);
  assert.equal(score.bullishWeight, 1.25);
  assert.equal(score.bearishWeight, 0);
  assert.equal(score.dominantDirection, "bullish");
  assert.equal(score.balance, 100);
});

test("contrary evidence is counted in the opposite direction", () => {
  const score = scoreEvidenceBundle(bundle([
    evidence({ direction: "bullish", role: "contrary" }),
  ]));
  assert.equal(score.bearishWeight, 1);
  assert.equal(score.bullishWeight, 0);
  assert.equal(score.dominantDirection, "bearish");
});

test("duplicate evidence IDs fail closed with no directional score", () => {
  const duplicate = evidence();
  const score = scoreEvidenceBundle(bundle([duplicate, { ...duplicate }]));
  assert.equal(score.valid, false);
  assert.equal(score.totalDirectionalWeight, 0);
  assert.ok(score.issues.some((issue) => issue.code === "DUPLICATE_EVIDENCE_ID"));
});

test("contextual, neutral, invalidated, and stale evidence add no directional weight", () => {
  const score = scoreEvidenceBundle(bundle([
    evidence({ evidenceId: "context", role: "contextual" }),
    evidence({ evidenceId: "neutral", direction: "neutral" }),
    evidence({ evidenceId: "invalidated", state: "invalidated", confirmedAt: undefined }),
    evidence({ evidenceId: "stale", quality: "stale", state: "provisional", confirmedAt: undefined }),
  ]));
  assert.equal(score.totalDirectionalWeight, 0);
  assert.equal(score.dominantDirection, "neutral");
});

test("scenario confirmation requires matching confirmed evidence and preserves input", () => {
  const original = scenario();
  const result = transitionScenario(original, "confirmed", {
    evaluatedAt: "2026-11-14T10:30:00.000Z",
    confirmationEvidence: [evidence()],
  });
  assert.equal(result.ok, true);
  assert.equal(result.scenario.state, "confirmed");
  assert.equal(original.state, "waiting_for_trigger");
});

test("scenario confirmation without evidence is rejected", () => {
  const result = transitionScenario(scenario(), "confirmed", {
    evaluatedAt: "2026-11-14T10:30:00.000Z",
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "SCENARIO_CONFIRMATION_EVIDENCE_REQUIRED"));
});

test("confirmed-only conditions cannot rely on forming candles", () => {
  const candidate = scenario({
    triggerConditions: [{
      conditionId: "forming-trigger",
      description: "Live candle trigger",
      sourceEngine: "structure",
      sourceEventType: "MSS",
      instrument: "EURUSD",
      timeframe: "M15",
      candleRequirement: "forming_allowed",
      requiredState: "confirmed",
    }],
  });
  const result = validateScenario(candidate);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "CONFIRMED_CONDITION_ALLOWS_FORMING_CANDLE"));
});

test("expired scenarios cannot be confirmed", () => {
  const result = transitionScenario(scenario(), "confirmed", {
    evaluatedAt: "2026-11-14T12:01:00.000Z",
    confirmationEvidence: [evidence()],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "SCENARIO_EXPIRED"));
});
