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

const { assessScalpingBehaviour } = require("../src/lib/trading-brain/skills/scalping/behaviour-guardrails.ts");

const asOf = "2026-11-06T12:00:00.000Z";
const ref = {
  sourceId: "private-journal", providerId: "user-journal", observedAt: asOf,
  receivedAt: asOf, instrument: "EURUSD", timeframe: "trade",
};
const record = (id, openedAt, outcome, lots, pnlTicks) => ({
  id, openedAt, closedAt: openedAt, instrument: "EURUSD", direction: "LONG",
  lots, outcome, pnlTicks, strategyTag: "scalp-momentum", sourceReferences: [ref],
});
const input = {
  userAuthorized: true, privacyScope: "PRIVATE_USER_ONLY", instrument: "EURUSD", asOf,
  records: [
    record("trade-1", "2026-11-06T10:30:00.000Z", "LOSS", 0.1, -4),
    record("trade-2", "2026-11-06T11:00:00.000Z", "LOSS", 0.1, -3),
    record("trade-3", "2026-11-06T11:30:00.000Z", "WIN", 0.2, 6),
  ],
};
const policy = {
  minimumRecords: 3, maximumRecordAgeSeconds: 86400,
  frequencyWindowSeconds: 3600, maximumTradesPerWindow: 2,
  maximumConsecutiveLosses: 1, sizeEscalationRatio: 1.5,
  requireProvenance: true,
};

test("requires explicit user authorization and private-only scope", () => {
  assert.equal(assessScalpingBehaviour({ ...input, userAuthorized: false }, policy).findings[0].code, "AUTHORIZATION_REQUIRED");
  assert.equal(assessScalpingBehaviour({ ...input, privacyScope: "UNCONFIRMED" }, policy).findings[0].code, "PRIVATE_SCOPE_REQUIRED");
});

test("requires explicit policy and sufficient private history", () => {
  assert.equal(assessScalpingBehaviour(input).status, "INCOMPLETE");
  const result = assessScalpingBehaviour({ ...input, records: input.records.slice(0, 2) }, policy);
  assert.equal(result.findings[0].code, "HISTORY_INSUFFICIENT");
});

test("reports frequency, loss-streak and size-escalation proxies plus private attribution", () => {
  const result = assessScalpingBehaviour(input, policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.equal(result.assessment.tradesInFrequencyWindow, 3);
  assert.equal(result.assessment.frequencyLimitExceeded, true);
  assert.equal(result.assessment.maximumConsecutiveLossesObserved, 2);
  assert.equal(result.assessment.lossStreakLimitExceeded, true);
  assert.equal(result.assessment.sizeEscalationObservations.length, 1);
  assert.equal(result.assessment.sizeEscalationObservations[0].ratio, 2);
  assert.deepEqual(result.assessment.strategyAttribution[0], {
    strategyTag: "scalp-momentum", trades: 3, wins: 1, losses: 2, netPnlTicks: -1,
  });
  assert.equal(result.assessment.privateScopeConfirmed, true);
  assert.equal(result.assessment.warningsOnly, true);
});

test("blocks stale, mismatched and unprovenanced records", () => {
  const stale = { ...input, records: input.records.map((item, index) => index === 0
    ? { ...item, closedAt: "2026-11-05T08:00:00.000Z" } : item) };
  assert.equal(assessScalpingBehaviour(stale, policy).status, "INCOMPLETE");

  const noProvenance = { ...input, records: input.records.map((item, index) => index === 0
    ? { ...item, sourceReferences: [] } : item) };
  assert.ok(assessScalpingBehaviour(noProvenance, policy).findings.some((item) => item.code === "PROVENANCE_MISSING"));
});

test("does not diagnose, pool private records or take account actions", () => {
  const result = assessScalpingBehaviour(input, policy);
  assert.ok(result.interpretations.some((item) => item.includes("do not establish intent")));
  assert.ok(result.limitations.some((item) => item.includes("No psychological or medical diagnosis")));
  assert.ok(result.limitations.some((item) => item.includes("no trade lockout")));
});
