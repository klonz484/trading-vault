export type JournalFeedbackKind = "take_profit_hit" | "stop_loss_hit" | "partial_take_profit" | "manual_close";
export interface JournalFeedbackEvent {
  eventId: string; kind: JournalFeedbackKind; recordedAt: string;
  realizedR?: number; actualExitPrice?: number; note?: string;
}
export interface JournalPlanSnapshot {
  date: string; symbol: string; side: "BUY" | "SELL"; entry: number; stop: number; target: number;
}
export interface JournalFeedbackTrade {
  id: string; date: string; symbol: string; side: "BUY" | "SELL";
  entry: number; stop: number; target: number;
  timeframe?: string; session?: string; setupType?: string; strategy?: string;
  outcome: "OPEN" | "WIN" | "LOSS" | "BREAKEVEN"; rMultiple: number; notes: string;
  realizedR?: number; originalPlan?: JournalPlanSnapshot; feedbackEvents?: JournalFeedbackEvent[];
}
export interface JournalFeedbackInput {
  eventId: string; kind: JournalFeedbackKind; recordedAt: string;
  realizedR?: number; actualExitPrice?: number; note?: string;
}
export function plannedRewardR(trade: Pick<JournalFeedbackTrade, "side" | "entry" | "stop" | "target">): number {
  const risk = Math.abs(trade.entry - trade.stop);
  if (!Number.isFinite(risk) || risk <= 0) throw new Error("A valid entry and stop are required to calculate planned R.");
  const reward = trade.side === "BUY" ? trade.target - trade.entry : trade.entry - trade.target;
  if (!Number.isFinite(reward) || reward <= 0) throw new Error("The target must be beyond the entry in the trade direction.");
  return Number((reward / risk).toFixed(8));
}
/** Appends a feedback event and preserves the initial plan snapshot. */
export function recordJournalFeedback<T extends JournalFeedbackTrade>(trade: T, input: JournalFeedbackInput): T {
  if (!input.eventId || !Number.isFinite(Date.parse(input.recordedAt))) throw new Error("Feedback requires a unique event ID and valid timestamp.");
  if ((trade.feedbackEvents ?? []).some((event) => event.eventId === input.eventId)) throw new Error("This feedback event has already been recorded.");
  if (input.realizedR !== undefined && !Number.isFinite(input.realizedR)) throw new Error("Realized R must be a finite number.");
  if (input.actualExitPrice !== undefined && (!Number.isFinite(input.actualExitPrice) || input.actualExitPrice <= 0)) throw new Error("Actual exit price must be a positive finite number.");
  const requiresPositive = input.kind === "take_profit_hit" || input.kind === "partial_take_profit";
  if (requiresPositive && (input.realizedR === undefined || input.realizedR <= 0)) throw new Error("Take-profit feedback requires a positive realized R value.");
  if (input.kind === "stop_loss_hit" && (input.realizedR === undefined || input.realizedR >= 0)) throw new Error("Stop-loss feedback requires a negative realized R value.");
  if (input.kind === "manual_close" && input.realizedR === undefined) throw new Error("Manual close feedback requires the realized R value.");
  const event: JournalFeedbackEvent = {
    eventId: input.eventId, kind: input.kind, recordedAt: input.recordedAt,
    ...(input.realizedR === undefined ? {} : { realizedR: input.realizedR }),
    ...(input.actualExitPrice === undefined ? {} : { actualExitPrice: input.actualExitPrice }),
    ...(input.note ? { note: input.note.slice(0, 500) } : {}),
  };
  const next: T = {
    ...trade,
    originalPlan: trade.originalPlan ?? { date: trade.date, symbol: trade.symbol, side: trade.side, entry: trade.entry, stop: trade.stop, target: trade.target },
    feedbackEvents: [...(trade.feedbackEvents ?? []), event],
  };
  const priorRealizedR = (trade.feedbackEvents ?? []).reduce((total, prior) => total + (prior.realizedR ?? 0), 0);
  const cumulativeRealizedR = priorRealizedR + (input.realizedR ?? 0);
  if (input.kind === "partial_take_profit") {
    // Keep the remaining position open; retain cumulative realized R for its eventual close.
    next.realizedR = cumulativeRealizedR;
  } else {
    next.outcome = cumulativeRealizedR > 0 ? "WIN" : cumulativeRealizedR < 0 ? "LOSS" : "BREAKEVEN";
    next.realizedR = cumulativeRealizedR;
    next.rMultiple = Math.abs(cumulativeRealizedR);
  }
  return next;
}
export function summarizeJournalFeedback(trades: readonly JournalFeedbackTrade[]) {
  const events = trades.flatMap((trade) => trade.feedbackEvents ?? []);
  return {
    eventCount: events.length,
    takeProfitHits: events.filter((event) => event.kind === "take_profit_hit").length,
    stopLossHits: events.filter((event) => event.kind === "stop_loss_hit").length,
    partialTakeProfits: events.filter((event) => event.kind === "partial_take_profit").length,
    manualCloses: events.filter((event) => event.kind === "manual_close").length,
    pendingReview: events.length,
  };
}


export interface PrivateLearningPattern {
  symbol: string;
  side: "BUY" | "SELL";
  timeframe: string;
  session: string;
  setupType: string;
  strategy: string;
  firstTradeDate: string;
  lastTradeDate: string;
  sampleCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  averageRealizedR: number;
  reviewState: "insufficient_sample" | "early_pattern" | "review_candidate";
}

/**
 * Descriptive, private-only pattern summary. It never changes a strategy.
 * Only closed trades with explicit feedback and realized R are included.
 */
export function analyzePrivateLearningPatterns(
  trades: readonly JournalFeedbackTrade[],
  reviewSampleSize = 10,
): PrivateLearningPattern[] {
  const groups = new Map<string, JournalFeedbackTrade[]>();
  for (const trade of trades) {
    const events = trade.feedbackEvents;
    const eventIds = new Set<string>();
    let eventTotal = 0;
    const hasValidFeedback = Array.isArray(events) && events.length > 0 && events.every((event) => {
      if (!event || typeof event.eventId !== "string" || event.eventId.length === 0 ||
          eventIds.has(event.eventId) ||
          !["take_profit_hit", "stop_loss_hit", "partial_take_profit", "manual_close"].includes(event.kind) ||
          typeof event.recordedAt !== "string" || !Number.isFinite(Date.parse(event.recordedAt)) ||
          typeof event.realizedR !== "number" || !Number.isFinite(event.realizedR)) return false;
      if ((event.kind === "take_profit_hit" || event.kind === "partial_take_profit") && event.realizedR <= 0) return false;
      if (event.kind === "stop_loss_hit" && event.realizedR >= 0) return false;
      eventIds.add(event.eventId);
      eventTotal += event.realizedR;
      return true;
    });
    const hasValidRealizedTotal = typeof trade.realizedR === "number" &&
      Number.isFinite(trade.realizedR) &&
      Math.abs(eventTotal - trade.realizedR) <= 0.000001;
    const outcomeMatchesRealized = trade.outcome === "WIN" ? trade.realizedR! > 0
      : trade.outcome === "LOSS" ? trade.realizedR! < 0
      : trade.outcome === "BREAKEVEN" ? trade.realizedR === 0
      : false;
    if (trade.outcome === "OPEN" || !hasValidFeedback || !hasValidRealizedTotal || !outcomeMatchesRealized) continue;
    const timeframe = trade.timeframe ?? "UNSPECIFIED";
    const session = trade.session ?? "UNKNOWN";
    const setupType = trade.setupType?.trim().toLowerCase() || "unspecified";
    const strategy = trade.strategy?.trim().toLowerCase() || "unspecified";
    const key = [trade.symbol.toUpperCase(), trade.side, timeframe, session, setupType, strategy].join(":");
    groups.set(key, [...(groups.get(key) ?? []), trade]);
  }

  return [...groups.values()].map((items) => {
    const wins = items.filter((trade) => trade.outcome === "WIN").length;
    const losses = items.filter((trade) => trade.outcome === "LOSS").length;
    const breakeven = items.filter((trade) => trade.outcome === "BREAKEVEN").length;
    const decisive = wins + losses;
    const sampleCount = items.length;
    const averageRealizedR = items.reduce((sum, trade) => sum + (trade.realizedR ?? 0), 0) / sampleCount;
    return {
      symbol: items[0].symbol.toUpperCase(),
      side: items[0].side,
      timeframe: items[0].timeframe ?? "UNSPECIFIED",
      session: items[0].session ?? "UNKNOWN",
      setupType: items[0].setupType?.trim() || "Unspecified",
      strategy: items[0].strategy?.trim() || "Unspecified",
      firstTradeDate: items.map((trade) => trade.date).sort()[0],
      lastTradeDate: items.map((trade) => trade.date).sort()[items.length - 1],
      sampleCount,
      wins,
      losses,
      breakeven,
      winRate: decisive ? Number((wins / decisive * 100).toFixed(1)) : null,
      averageRealizedR: Number(averageRealizedR.toFixed(3)),
      reviewState: sampleCount >= Math.max(10, reviewSampleSize)
        ? "review_candidate" as const
        : sampleCount >= 5 ? "early_pattern" as const : "insufficient_sample" as const,
    };
  }).sort((a, b) => a.symbol.localeCompare(b.symbol) || a.side.localeCompare(b.side) || a.timeframe.localeCompare(b.timeframe) || a.session.localeCompare(b.session));
}


export interface PrivateExperimentDraftPayload {
  schemaVersion: 1;
  scope: "private_trader";
  hypothesis: string;
  mechanism: string;
  baseline: { kind: "journal_observation"; version: "journal-feedback-v1"; strategyVersion: "not_recorded" };
  candidate: { version: null; ruleChanges: [] };
  protocolVersion: "1.0";
  sourcePatternKey: string;
  sourcePattern: PrivateLearningPattern;
  sampleDefinition: { included: string; currentSampleSize: number; targetSampleSize: 20; dateRange: { from: string; to: string } };
  metricsDefinition: { primary: "average_realized_R"; secondary: ["win_rate", "win_loss_breakeven_counts"]; guardrails: string[] };
  lifecycle: { state: "proposed"; approvedForResearch: false; automaticStrategyChanges: false; sharedCoreContribution: false };
  limitations: string[];
}

export function privateLearningPatternKey(pattern: Pick<PrivateLearningPattern, "symbol" | "side" | "timeframe" | "session" | "setupType" | "strategy">): string {
  return [
    pattern.symbol.toUpperCase(), pattern.side, pattern.timeframe, pattern.session,
    pattern.setupType.toLowerCase(), pattern.strategy.toLowerCase(),
  ].join(":");
}

/** Creates a research proposal only; it does not define or apply a strategy change. */
export function createPrivateExperimentDraft(pattern: PrivateLearningPattern): PrivateExperimentDraftPayload {
  if (pattern.reviewState !== "review_candidate" || pattern.sampleCount < 10) {
    throw new Error("A private experiment draft requires at least ten eligible closed trades.");
  }
  const sourcePatternKey = privateLearningPatternKey(pattern);
  const context = [pattern.symbol, pattern.side, pattern.timeframe, pattern.session.replace(/_/g, " "), pattern.setupType, pattern.strategy]
    .filter((value) => value && value !== "Unspecified").join(" / ");
  return {
    schemaVersion: 1,
    scope: "private_trader",
    hypothesis: `Review whether outcomes for ${context} are stable enough to justify a separately tested strategy hypothesis.`,
    mechanism: "Compare trader-recorded closed-trade outcomes within one consistent market context; this is observational evidence, not proof of causation.",
    baseline: { kind: "journal_observation", version: "journal-feedback-v1", strategyVersion: "not_recorded" },
    candidate: { version: null, ruleChanges: [] },
    protocolVersion: "1.0",
    sourcePatternKey,
    sourcePattern: pattern,
    sampleDefinition: {
      included: "Closed journal trades with explicit feedback events and finite signed realized R, grouped by the exact context shown.",
      currentSampleSize: pattern.sampleCount,
      targetSampleSize: 20,
      dateRange: { from: pattern.firstTradeDate, to: pattern.lastTradeDate },
    },
    metricsDefinition: {
      primary: "average_realized_R",
      secondary: ["win_rate", "win_loss_breakeven_counts"],
      guardrails: [
        "Do not treat a small or selected journal sample as statistically conclusive.",
        "Do not claim net profitability when spread, commission and slippage are not captured.",
        "Do not change active strategy rules from this proposal.",
        "Do not contribute private records to Shared Core.",
      ],
    },
    lifecycle: { state: "proposed", approvedForResearch: false, automaticStrategyChanges: false, sharedCoreContribution: false },
    limitations: [
      "No candidate rule change has been defined.",
      "Strategy, market-data and engine baseline versions are not yet linked to these journal records.",
      "The sample is observational and may contain selection bias.",
      "A separate experiment protocol and approval are required before research execution.",
    ],
  };
}

/** Rebuilds a proposal from authenticated journal records rather than trusting client-supplied metrics. */
export function createPrivateExperimentDraftFromTrades(
  trades: readonly JournalFeedbackTrade[],
  requestedPatternKey: string,
): PrivateExperimentDraftPayload {
  const pattern = analyzePrivateLearningPatterns(trades)
    .find((candidate) => privateLearningPatternKey(candidate) === requestedPatternKey);
  if (!pattern) throw new Error("The requested learning pattern is not present in the authenticated journal.");
  return createPrivateExperimentDraft(pattern);
}
