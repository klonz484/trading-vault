/* eslint @typescript-eslint/no-require-imports: off -- Node's TypeScript test loader uses CommonJS require hooks. */
const test = require("node:test");
const {
  assert,
  evidence,
  bundle,
  scenario,
  scoreEvidenceBundle,
  transitionScenario,
  validateScenario,
  adaptEngineEvent,
  plannedRewardR,
  recordJournalFeedback,
  summarizeJournalFeedback,
  analyzePrivateLearningPatterns,
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

test("contrary role never reverses the source event direction", () => {
  const score = scoreEvidenceBundle(bundle([
    evidence({ direction: "bullish", role: "contrary" }),
  ]));
  assert.equal(score.bullishWeight, 1);
  assert.equal(score.bearishWeight, 0);
  assert.equal(score.dominantDirection, "bullish");
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

test("engine adapter preserves provisional state and rejects premature confirmation", () => {
  const provisional = evidence({ state: "provisional", confirmedAt: undefined });
  const adapted = adaptEngineEvent(provisional, "supporting");
  assert.equal(adapted.valid, true);
  assert.equal(adapted.evidence.state, "provisional");

  const malformed = adaptEngineEvent(
    evidence({ state: "provisional", confirmedAt: "2026-11-14T10:00:02.000Z" }),
    "supporting",
  );
  assert.equal(malformed.valid, false);
  assert.ok(malformed.issues.some((issue) => issue.code === "PROVISIONAL_HAS_CONFIRMATION_TIME"));
});


test("journal feedback snapshots the original plan and records target outcome as realized R", () => {
  const trade = { id: "t1", date: "2026-11-14", symbol: "EURUSD", side: "BUY", entry: 1.1, stop: 1.095, target: 1.11, outcome: "OPEN", rMultiple: 2, notes: "" };
  assert.equal(plannedRewardR(trade), 2);
  const updated = recordJournalFeedback(trade, { eventId: "fb-1", kind: "take_profit_hit", recordedAt: "2026-11-14T12:00:00.000Z", realizedR: 2, actualExitPrice: 1.11 });
  assert.equal(updated.outcome, "WIN"); assert.equal(updated.realizedR, 2);
  assert.deepEqual(updated.originalPlan, { date: trade.date, symbol: trade.symbol, side: trade.side, entry: trade.entry, stop: trade.stop, target: trade.target });
  assert.equal(trade.outcome, "OPEN"); assert.equal(updated.feedbackEvents.length, 1);
});
test("stop-loss feedback records negative realized R", () => {
  const trade = { id: "t2", date: "2026-11-14", symbol: "EURUSD", side: "SELL", entry: 1.1, stop: 1.105, target: 1.09, outcome: "OPEN", rMultiple: 2, notes: "" };
  const updated = recordJournalFeedback(trade, { eventId: "fb-2", kind: "stop_loss_hit", recordedAt: "2026-11-14T12:00:00.000Z", realizedR: -1, actualExitPrice: 1.105 });
  assert.equal(updated.outcome, "LOSS"); assert.equal(updated.realizedR, -1);
});
test("partial take-profit accumulates realized R and leaves the remainder open until its final close", () => {
  const trade = { id: "t3", date: "2026-11-14", symbol: "XAUUSD", side: "BUY", entry: 2600, stop: 2590, target: 2620, outcome: "OPEN", rMultiple: 2, notes: "" };
  const partial = recordJournalFeedback(trade, { eventId: "fb-3", kind: "partial_take_profit", recordedAt: "2026-11-14T12:00:00.000Z", realizedR: 0.5 });
  assert.equal(partial.outcome, "OPEN"); assert.equal(partial.realizedR, 0.5);
  const closed = recordJournalFeedback(partial, { eventId: "fb-3b", kind: "stop_loss_hit", recordedAt: "2026-11-14T12:30:00.000Z", realizedR: -0.25 });
  assert.equal(closed.outcome, "WIN"); assert.equal(closed.realizedR, 0.25);
  assert.equal(closed.feedbackEvents.length, 2);
});
test("feedback rejects duplicate IDs and stop-loss with positive R", () => {
  const trade = { id: "t4", date: "2026-11-14", symbol: "EURUSD", side: "BUY", entry: 1.1, stop: 1.095, target: 1.11, outcome: "OPEN", rMultiple: 2, notes: "" };
  const event = { eventId: "fb-4", kind: "stop_loss_hit", recordedAt: "2026-11-14T12:00:00.000Z", realizedR: -1 };
  const once = recordJournalFeedback(trade, event);
  assert.throws(() => recordJournalFeedback(once, event), /already been recorded/);
  assert.throws(() => recordJournalFeedback(trade, { ...event, realizedR: 1 }), /negative realized R/);
});
test("feedback summary counts events by outcome category", () => {
  const trades = [
    { id: "t5", date: "2026-11-14", symbol: "EURUSD", side: "BUY", entry: 1.1, stop: 1.095, target: 1.11, outcome: "OPEN", rMultiple: 2, notes: "", feedbackEvents: [{ eventId: "a", kind: "take_profit_hit", recordedAt: "2026-11-14T12:00:00.000Z", realizedR: 2 }] },
    { id: "t6", date: "2026-11-14", symbol: "XAUUSD", side: "SELL", entry: 2600, stop: 2610, target: 2580, outcome: "OPEN", rMultiple: 2, notes: "", feedbackEvents: [{ eventId: "b", kind: "stop_loss_hit", recordedAt: "2026-11-14T12:00:00.000Z", realizedR: -1 }] },
  ];
  assert.deepEqual(summarizeJournalFeedback(trades), { eventCount: 2, takeProfitHits: 1, stopLossHits: 1, partialTakeProfits: 0, manualCloses: 0, pendingReview: 2 });
});


test("private learning patterns exclude open and unreviewed trades and disclose sample strength", () => {
  const base = { date: "2026-11-14", symbol: "EURUSD", side: "BUY", entry: 1.1, stop: 1.095, target: 1.11, rMultiple: 1, notes: "", feedbackEvents: [{ eventId: "f", kind: "manual_close", recordedAt: "2026-11-14T12:00:00.000Z", realizedR: 1 }] };
  const trades = Array.from({ length: 5 }, (_, index) => ({
    ...base, id: "p" + index, outcome: index < 3 ? "WIN" : "LOSS", realizedR: index < 3 ? 1 : -1,
  })).concat([{ ...base, id: "open", outcome: "OPEN", realizedR: 0.5 }]);
  const patterns = analyzePrivateLearningPatterns(trades);
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].sampleCount, 5);
  assert.equal(patterns[0].wins, 3);
  assert.equal(patterns[0].losses, 2);
  assert.equal(patterns[0].winRate, 60);
  assert.equal(patterns[0].reviewState, "early_pattern");
  assert.equal(patterns[0].timeframe, "UNSPECIFIED");
});


test("private learning patterns separate different market contexts", () => {
  const base = { date: "2026-11-14", symbol: "EURUSD", side: "BUY", entry: 1.1, stop: 1.095, target: 1.11, rMultiple: 1, notes: "", outcome: "WIN", realizedR: 1, feedbackEvents: [{ eventId: "f", kind: "take_profit_hit", recordedAt: "2026-11-14T12:00:00.000Z", realizedR: 1 }] };
  const patterns = analyzePrivateLearningPatterns([
    { ...base, id: "a", timeframe: "M15", session: "LONDON", setupType: "MSS retest", strategy: "Trend continuation" },
    { ...base, id: "b", timeframe: "H1", session: "NEW_YORK", setupType: "Liquidity sweep", strategy: "Reversal" },
  ]);
  assert.equal(patterns.length, 2);
  assert.ok(patterns.some((item) => item.timeframe === "M15" && item.session === "LONDON"));
  assert.ok(patterns.some((item) => item.timeframe === "H1" && item.session === "NEW_YORK"));
});
