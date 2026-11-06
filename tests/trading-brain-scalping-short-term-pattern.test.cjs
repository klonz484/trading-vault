/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");
const { assessScalpingShortTermPattern } = require("../src/lib/trading-brain/skills/scalping/short-term-pattern.ts");

const policy = {
  minimumObservations: 4,
  minimumHorizonSeconds: 1,
  maximumHorizonSeconds: 10,
  maximumInterObservationGapSeconds: 2,
  maximumQuoteAgeSeconds: 2,
  minimumNetMoveTicks: 3,
  minimumDirectionalConsistency: 0.75,
  maximumAverageSpreadTicks: 2,
  requireSourceProvenance: true,
};
const base = {
  symbol: "EURUSD",
  asOf: "2026-11-06T10:00:04.000Z",
  tickSize: 0.00001,
  sequenceComplete: true,
  observations: [
    { sequence: 1, timestamp: "2026-11-06T10:00:00.000Z", instrument: "EURUSD", bid: 1.10000, ask: 1.10001 },
    { sequence: 2, timestamp: "2026-11-06T10:00:01.000Z", instrument: "EURUSD", bid: 1.10002, ask: 1.10003 },
    { sequence: 3, timestamp: "2026-11-06T10:00:02.000Z", instrument: "EURUSD", bid: 1.10004, ask: 1.10005 },
    { sequence: 4, timestamp: "2026-11-06T10:00:03.000Z", instrument: "EURUSD", bid: 1.10005, ask: 1.10006 },
  ],
  sourceReferences: [{
    sourceId: "quote-stream",
    providerId: "test-feed",
    observedAt: "2026-11-06T10:00:03.000Z",
    receivedAt: "2026-11-06T10:00:03.100Z",
    instrument: "EURUSD",
    timeframe: "tick",
  }],
};

test("identifies a configured upward quote-sequence impulse", () => {
  const result = assessScalpingShortTermPattern(base, policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.equal(result.assessment.candidate, "UPWARD_IMPULSE");
  assert.ok(Math.abs(result.assessment.netMoveTicks - 5) < 1e-8);
  assert.equal(result.assessment.directionalConsistency, 1);
});

test("identifies a configured downward quote-sequence impulse", () => {
  const observations = base.observations.map((item, index) => ({
    ...item,
    bid: 1.10005 - index * 0.00002,
    ask: 1.10006 - index * 0.00002,
  }));
  const result = assessScalpingShortTermPattern({ ...base, observations }, policy);
  assert.equal(result.assessment.candidate, "DOWNWARD_IMPULSE");
});

test("does not infer a pattern from incomplete or undersampled sequences", () => {
  const incomplete = assessScalpingShortTermPattern({ ...base, sequenceComplete: false }, policy);
  assert.equal(incomplete.status, "INCOMPLETE");
  assert.equal(incomplete.assessment.candidate, "NOT_ASSESSABLE");
  const short = assessScalpingShortTermPattern({ ...base, observations: base.observations.slice(0, 2) }, policy);
  assert.ok(short.findings.some((finding) => finding.code === "INSUFFICIENT_OBSERVATIONS"));
});

test("requires explicit policy and matching source provenance", () => {
  assert.equal(assessScalpingShortTermPattern(base).findings[0].code, "POLICY_MISSING");
  const noSource = assessScalpingShortTermPattern({ ...base, sourceReferences: [] }, policy);
  assert.ok(noSource.findings.some((finding) => finding.code === "SOURCE_PROVENANCE_MISSING"));
});

test("blocks invalid ordering, sequence gaps, stale quotes and wide spreads", () => {
  const unordered = assessScalpingShortTermPattern({
    ...base,
    observations: [base.observations[1], base.observations[0], ...base.observations.slice(2)],
  }, policy);
  assert.ok(unordered.findings.some((finding) => finding.code === "INVALID_SEQUENCE"));

  const gap = assessScalpingShortTermPattern({
    ...base,
    observations: base.observations.map((item, index) => index === 2
      ? { ...item, timestamp: "2026-11-06T10:00:06.000Z" }
      : index === 3 ? { ...item, timestamp: "2026-11-06T10:00:07.000Z" } : item),
    asOf: "2026-11-06T10:00:08.000Z",
    sourceReferences: [{ ...base.sourceReferences[0], observedAt: "2026-11-06T10:00:07.000Z", receivedAt: "2026-11-06T10:00:07.100Z" }],
  }, policy);
  assert.ok(gap.findings.some((finding) => finding.code === "EXCESSIVE_GAP"));

  const stale = assessScalpingShortTermPattern({ ...base, asOf: "2026-11-06T10:00:10.000Z" }, policy);
  assert.ok(stale.findings.some((finding) => finding.code === "STALE_QUOTE"));

  const wide = assessScalpingShortTermPattern({
    ...base,
    observations: base.observations.map((item) => ({ ...item, ask: item.bid + 0.00005 })),
  }, policy);
  assert.ok(wide.findings.some((finding) => finding.code === "SPREAD_TOO_WIDE"));
});

test("never presents the observation as an executable trade signal", () => {
  const result = assessScalpingShortTermPattern(base, policy);
  assert.match(result.limitations.join(" "), /No BUY\/SELL signal/);
  assert.equal(result.assessment.candidate, "UPWARD_IMPULSE");
});
