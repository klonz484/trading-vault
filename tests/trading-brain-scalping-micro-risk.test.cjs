/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");
const { assessScalpingMicroRisk } = require("../src/lib/trading-brain/skills/scalping/micro-risk.ts");

const policy = {
  maximumTradeRiskTicks: 40,
  maximumSessionLossTicks: 100,
  maximumAbsoluteNetLots: 1.5,
  maximumPositionAgeSeconds: 30,
  requireSourceProvenance: true,
};
const base = {
  symbol: "EURUSD",
  asOf: "2026-11-06T10:00:00.000Z",
  userAuthorized: true,
  inventoryComplete: true,
  tickSize: 0.00001,
  minimumLot: 0.01,
  lotStep: 0.01,
  positions: [
    { id: "p1", direction: "LONG", lots: 1, riskDistanceTicks: 25, observedAt: "2026-11-06T09:59:50.000Z" },
    { id: "p2", direction: "SHORT", lots: 0.25, riskDistanceTicks: 30, observedAt: "2026-11-06T09:59:51.000Z" },
  ],
  sessionLossTicks: 45,
  sourceReferences: [{
    sourceId: "private-position-snapshot",
    providerId: "user-authorized-record",
    observedAt: "2026-11-06T09:59:50.000Z",
    receivedAt: "2026-11-06T09:59:52.000Z",
    instrument: "EURUSD",
    timeframe: "tick",
  }],
};

test("assesses supplied tick risk and inventory against explicit limits", () => {
  const result = assessScalpingMicroRisk(base, policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.equal(result.assessment.grossLots, 1.25);
  assert.equal(result.assessment.netLots, 0.75);
  assert.equal(result.assessment.largestPositionRiskTicks, 30);
  assert.equal(result.assessment.status, "WITHIN_LIMITS");
});

test("does not assess inventory without user authorization", () => {
  const result = assessScalpingMicroRisk({ ...base, userAuthorized: false }, policy);
  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(result.assessment.status, "NOT_ASSESSABLE");
});

test("blocks current exposure claims when inventory is incomplete", () => {
  const result = assessScalpingMicroRisk({ ...base, inventoryComplete: false }, policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.assessment.netInventoryWithinLimit, null);
});

test("requires explicit policy and instrument tick/lot metadata", () => {
  assert.equal(assessScalpingMicroRisk(base).findings[0].code, "POLICY_MISSING");
  const invalid = assessScalpingMicroRisk({ ...base, tickSize: 0 }, policy);
  assert.equal(invalid.findings[0].code, "INVALID_INSTRUMENT_METADATA");
});

test("reports per-position, session-loss and net-inventory limit breaches without actions", () => {
  const result = assessScalpingMicroRisk({
    ...base,
    positions: [{ ...base.positions[0], lots: 2, riskDistanceTicks: 55 }],
    sessionLossTicks: 120,
  }, policy);
  assert.equal(result.assessment.status, "LIMIT_BREACH");
  assert.ok(result.findings.some((finding) => finding.code === "TRADE_RISK_LIMIT_EXCEEDED"));
  assert.ok(result.findings.some((finding) => finding.code === "SESSION_LOSS_LIMIT_EXCEEDED"));
  assert.ok(result.findings.some((finding) => finding.code === "NET_INVENTORY_LIMIT_EXCEEDED"));
  assert.match(result.limitations.join(" "), /no circuit breaker/);
});

test("rejects stale, future, malformed and duplicate position records", () => {
  const stale = assessScalpingMicroRisk({
    ...base,
    positions: [{ ...base.positions[0], observedAt: "2026-11-06T09:58:00.000Z" }],
  }, policy);
  assert.equal(stale.assessment.status, "NOT_ASSESSABLE");
  assert.ok(stale.findings.some((finding) => finding.code === "STALE_POSITION"));

  const future = assessScalpingMicroRisk({
    ...base,
    positions: [{ ...base.positions[0], observedAt: "2026-11-06T10:01:00.000Z" }],
  }, policy);
  assert.ok(future.findings.some((finding) => finding.code === "INVALID_TIMESTAMP"));

  const duplicate = assessScalpingMicroRisk({
    ...base,
    positions: [base.positions[0], base.positions[0]],
  }, policy);
  assert.ok(duplicate.findings.some((finding) => finding.code === "DUPLICATE_POSITION_ID"));
});

test("requires provenance when policy says so and validates session loss", () => {
  const missing = assessScalpingMicroRisk({ ...base, sourceReferences: [] }, policy);
  assert.equal(missing.assessment.status, "NOT_ASSESSABLE");
  assert.ok(missing.findings.some((finding) => finding.code === "SOURCE_PROVENANCE_MISSING"));
  const invalid = assessScalpingMicroRisk({ ...base, sessionLossTicks: -1 }, policy);
  assert.equal(invalid.findings[0].code, "INVALID_SESSION_LOSS");
});
