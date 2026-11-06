const { assessWithTradingBrain } = require("../src/lib/trading-brain/assessment.ts");

test("Brain service remains non-directional until methodology rules are implemented", () => {
  const result = assessWithTradingBrain({
    analysisId: "brain-stub-test",
    instrument: "EURUSD",
    timeframe: "H1",
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
});
