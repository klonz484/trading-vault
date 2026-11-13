/* global require */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

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

const {
  assessWithTradingBrain,
  createBrainAssessmentInputFromMarketData,
} = require("../src/lib/trading-brain/assessment.ts");

test("Brain service remains non-directional until methodology rules are implemented", () => {
  const result = assessWithTradingBrain({
    analysisId: "brain-stub-test",
    instrument: "EURUSD",
    timeframe: "H1",
    marketDataGate: "LIVE_ELIGIBLE",
    evidenceReadiness: "READY",
    sourceReferences: ["validated-snapshot:test"],
    limitations: [],
    closedCandleEvidenceAvailable: true,
    higherTimeframeEvidenceAvailable: true,
    validatedMarketStructureAvailable: true,
  });

  assert.equal(result.system, "BRAIN");
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.decision, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.tradePlan, { orderType: "NONE", entryType: "none" });
  assert.equal(result.methodologyVersion, "brain-methodology-pending/0.1.0");
  assert.ok(result.uncertainties.some((item) => item.includes("has not yet been implemented")));
});

test("Brain service records missing evidence and non-ready market data", () => {
  const result = assessWithTradingBrain({
    analysisId: "brain-missing-evidence-test",
    instrument: "XAUUSD",
    timeframe: "H1",
    marketDataGate: "REPLAY_ONLY",
    evidenceReadiness: "DEGRADED",
    sourceReferences: [],
    limitations: ["Provider snapshot is incomplete."],
    closedCandleEvidenceAvailable: false,
    higherTimeframeEvidenceAvailable: false,
    validatedMarketStructureAvailable: false,
  });

  assert.equal(result.decision, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.tradePlan.orderType, "NONE");
  assert.ok(result.uncertainties.some((item) => item.includes("closed-candle")));
  assert.ok(result.uncertainties.some((item) => item.includes("higher-timeframe")));
  assert.ok(result.uncertainties.some((item) => item.includes("DEGRADED")));
  assert.ok(result.uncertainties.some((item) => item.includes("REPLAY_ONLY")));
});

test("typed constructor derives only closed-candle evidence and preserves gate", () => {
  const input = createBrainAssessmentInputFromMarketData({
    analysisId: "adapter-constructor-test",
    marketData: {
      contractVersion: "1.0.0",
      snapshotVersion: "snapshot:test",
      instrument: "EURUSD",
      timeframe: "M15",
      provider: "twelve_data",
      retrievedAt: "2026-11-12T10:15:00.000Z",
      sourceSymbol: "EUR/USD",
      sourceTimezone: "UTC",
      entitlementStatus: "UNVERIFIED",
      licenceStatus: "UNVERIFIED",
      readiness: "READY",
      gate: "REPLAY_ONLY",
      candles: [
        {
          timestamp: "2026-11-12T10:00:00.000Z",
          open: 1.1,
          high: 1.12,
          low: 1.09,
          close: 1.11,
          provisional: true,
        },
      ],
      sourceReferences: ["market-data:snapshot:test"],
      limitations: ["Replay only."],
    },
  });

  assert.equal(input.marketDataGate, "REPLAY_ONLY");
  assert.equal(input.closedCandleEvidenceAvailable, false);
  assert.equal(input.higherTimeframeEvidenceAvailable, false);
  assert.equal(input.validatedMarketStructureAvailable, false);
  assert.deepEqual(input.sourceReferences, ["market-data:snapshot:test"]);

  const result = assessWithTradingBrain(input);
  assert.equal(result.decision, "INSUFFICIENT_EVIDENCE");
  assert.ok(result.uncertainties.some((item) => item.includes("REPLAY_ONLY")));
});
