/* eslint @typescript-eslint/no-require-imports: off -- Node's TypeScript test loader uses CommonJS require hooks. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

// Load the project's TypeScript service files directly without adding a test dependency.
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { scoreEvidenceBundle } = require("../../src/lib/trading-brain/evidence-scoring.ts");
const { transitionScenario } = require("../../src/lib/trading-brain/scenario-lifecycle.ts");
const { validateScenario } = require("../../src/lib/trading-brain/validation.ts");
const { adaptEngineEvent } = require("../../src/lib/trading-brain/engine-event-adapter.ts");
const { plannedRewardR, recordJournalFeedback, summarizeJournalFeedback } = require("../../src/lib/trading-brain/feedback-learning.ts");

function evidence(overrides = {}) {
  return {
    evidenceId: "ev-1",
    sourceEngine: "structure",
    sourceRecordId: "record-1",
    sourceSchemaVersion: "1.0",
    instrument: "EURUSD",
    timeframe: "M15",
    observedAt: "2026-11-14T10:00:00.000Z",
    detectedAt: "2026-11-14T10:00:01.000Z",
    state: "confirmed",
    confirmedAt: "2026-11-14T10:00:02.000Z",
    role: "supporting",
    direction: "bullish",
    sourceSnapshotIds: ["snapshot-1"],
    lineageIds: ["lineage-1"],
    quality: "valid",
    ...overrides,
  };
}

function bundle(items) {
  return {
    bundleId: "bundle-1",
    bundleVersion: "1.0",
    workflow: "current_market",
    instrument: "EURUSD",
    createdAt: "2026-11-14T10:00:03.000Z",
    evidence: items,
    sourceSnapshotIds: ["snapshot-1"],
  };
}

function scenario(overrides = {}) {
  const trigger = {
    conditionId: "trigger-1",
    description: "Confirmed structure break",
    sourceEngine: "structure",
    sourceEventType: "BOS",
    instrument: "EURUSD",
    timeframe: "M15",
    candleRequirement: "closed_only",
    requiredState: "confirmed",
  };
  return {
    scenarioId: "scenario-1",
    scenarioVersion: "1.0",
    scope: "private_trader",
    ownerId: "user-1",
    workflow: "current_market",
    instrument: "EURUSD",
    timeframe: "M15",
    state: "waiting_for_trigger",
    triggerConditions: [trigger],
    confirmationConditions: [],
    invalidationConditions: [],
    createdAt: "2026-11-14T09:00:00.000Z",
    expiresAt: "2026-11-14T12:00:00.000Z",
    evidenceBundleId: "bundle-1",
    ...overrides,
  };
}

module.exports = { assert, evidence, bundle, scenario, scoreEvidenceBundle, transitionScenario, validateScenario, adaptEngineEvent, plannedRewardR, recordJournalFeedback, summarizeJournalFeedback };
