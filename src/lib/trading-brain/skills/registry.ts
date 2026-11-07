export type BrainSkillStatus =
  | "PLANNED"
  | "IN_DEVELOPMENT"
  | "IMPLEMENTED"
  | "TESTED"
  | "ENABLED";

export type BrainSkillGroup =
  | "CORE_ANALYSIS"
  | "CONTEXT"
  | "RISK"
  | "LEARNING"
  | "QUALITY"
  | "ORCHESTRATION"
  | "SCALPING";

export interface BrainSkillDefinition {
  id: string;
  name: string;
  group: BrainSkillGroup;
  purpose: string;
  requiredEvidence: string[];
  outputs: string[];
  dependencies: string[];
  safetyRules: string[];
  status: BrainSkillStatus;
  version: string;
}

const commonSafety = [
  "Never fabricate prices, candles, indicators, news, or source provenance.",
  "Preserve supporting evidence, contrary evidence, assumptions, and uncertainty.",
  "Do not independently authorize order execution; manual MT5 only.",
  "Return INSUFFICIENT_EVIDENCE when required inputs or validation are missing.",
];

export const TRADING_BRAIN_SKILLS: readonly BrainSkillDefinition[] = [
  {
    id: "market-structure",
    name: "Market Structure Intelligence",
    group: "CORE_ANALYSIS",
    purpose: "Classify swings, trend/range state, BOS, CHoCH/MSS, displacement, retests, and structural invalidation.",
    requiredEvidence: ["Timestamped OHLC candles", "Closed-candle state", "Swing classification rules", "Instrument precision"],
    outputs: ["Swing map", "Structure state", "Confirmed/provisional breaks", "Invalidation evidence"],
    dependencies: ["evidence-quality"],
    safetyRules: [...commonSafety, "Never promote a provisional forming-candle event to confirmed structure."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "liquidity",
    name: "Liquidity Intelligence",
    group: "CORE_ANALYSIS",
    purpose: "Evaluate equal highs/lows, liquidity pools, sweeps, stop runs, and potential objectives.",
    requiredEvidence: ["Validated OHLC history", "Swing map", "Timestamp and timeframe provenance"],
    outputs: ["Liquidity pool map", "Sweep candidates", "Objective candidates", "Contrary evidence"],
    dependencies: ["market-structure", "evidence-quality"],
    safetyRules: [...commonSafety, "Describe liquidity targets as hypotheses, not known resting orders."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "institutional-concepts",
    name: "Institutional Concepts Intelligence",
    group: "CORE_ANALYSIS",
    purpose: "Qualify order blocks, fair-value gaps, breakers, mitigation/rejection blocks, and liquidity voids.",
    requiredEvidence: ["Validated candles", "Structure events", "Displacement evidence", "Zone qualification rules"],
    outputs: ["Qualified zones", "Zone state", "Mitigation status", "Invalidation levels"],
    dependencies: ["market-structure", "liquidity", "evidence-quality"],
    safetyRules: [...commonSafety, "Do not label every candle or gap as an institutional zone.", "Treat zones as candidates, not proof of institutional orders."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "multi-timeframe",
    name: "Multi-Timeframe Intelligence",
    group: "CONTEXT",
    purpose: "Reconcile higher- and lower-timeframe context using explicit hierarchy and conflict rules.",
    requiredEvidence: ["Synchronized candles for each requested timeframe", "Timeframe completeness", "Timestamp alignment"],
    outputs: ["Timeframe context map", "Alignment/conflict state", "Missing timeframe warnings"],
    dependencies: ["evidence-quality"],
    safetyRules: [...commonSafety, "Never infer an unavailable higher timeframe from a lower-timeframe screenshot.", "Preserve opposing timeframe evidence instead of forcing consensus."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "session-timing",
    name: "Session and Timing Intelligence",
    group: "CONTEXT",
    purpose: "Evaluate trading sessions, session ranges, timing windows, volatility conditions, and event proximity.",
    requiredEvidence: ["Absolute timestamps", "Explicit IANA timezone and local session schedule", "Verified calendar provenance", "Explicit instrument currency relevance", "Sourced event windows"],
    outputs: ["Active session state", "Timezone-aware local time", "Relevant event windows", "Calendar freshness and provenance findings"],
    dependencies: ["evidence-quality"],
    safetyRules: [...commonSafety, "Never infer market hours, holidays, or event times.", "Apply explicit IANA timezones and preserve daylight-saving uncertainty.", "Do not infer session ranges without validated candle data."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "indicator",
    name: "Indicator Intelligence",
    group: "CORE_ANALYSIS",
    purpose: "Calculate and interpret approved indicators as supporting or contrary evidence.",
    requiredEvidence: ["Complete READY evidence assessment", "Timestamped OHLC candles with closed-candle state", "Explicit indicator periods and calculation definitions", "Source and instrument/timeframe provenance"],
    outputs: ["SMA/EMA values", "Wilder RSI and ATR values", "MACD line/signal/histogram", "Warm-up and freshness findings"],
    dependencies: ["evidence-quality"],
    safetyRules: [...commonSafety, "Exclude forming candles from confirmed values.", "Indicators are supporting evidence and cannot independently force BUY or SELL.", "Do not infer indicator thresholds or numerical confidence."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "instrument-specialist",
    name: "Forex and Gold Specialist Intelligence",
    group: "CONTEXT",
    purpose: "Apply instrument-specific precision, pip/tick, spread, session, volatility, and contract conventions.",
    requiredEvidence: ["Validated instrument metadata", "Quote currency/base currency", "Tick and lot specifications", "Current spread provenance"],
    outputs: ["Instrument profile", "Precision rules", "Cost and volatility context", "Unsupported-instrument warnings"],
    dependencies: ["evidence-quality"],
    safetyRules: [...commonSafety, "Never assume a universal pip, tick, lot, or contract size."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "risk-planning",
    name: "Risk and Trade Planning Intelligence",
    group: "RISK",
    purpose: "Validate entry geometry, stop placement, target sequence, risk/reward, sizing inputs, and invalidation.",
    requiredEvidence: ["Account risk inputs when sizing", "Instrument metadata", "Spread/cost assumptions", "Explicit entry and stop/target levels"],
    outputs: ["Plan validation", "Risk/reward ranges", "Sizing calculation inputs", "Risk limitations"],
    dependencies: ["instrument-specialist", "market-structure", "evidence-quality"],
    safetyRules: [...commonSafety, "Never invent account balance or risk tolerance.", "No order placement or broker write access."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "backtesting",
    name: "Backtesting and Learning Intelligence",
    group: "LEARNING",
    purpose: "Replay versioned strategies on historical data and report performance with leakage and bias controls.",
    requiredEvidence: ["Versioned strategy rules", "Historically valid data", "Execution/cost assumptions", "Train/test separation"],
    outputs: ["Replay results", "Trade distribution", "Drawdown and expectancy metrics", "Limitations and reproducibility metadata"],
    dependencies: ["market-structure", "liquidity", "risk-planning", "evidence-quality"],
    safetyRules: [...commonSafety, "Do not present backtest results as guaranteed future performance."],
    status: "PLANNED",
    version: "0.1.0",
  },
  {
    id: "performance-behaviour",
    name: "Performance and Behaviour Intelligence",
    group: "LEARNING",
    purpose: "Analyze a trader's private journal and outcomes for patterns, execution discipline, and recurring errors.",
    requiredEvidence: ["User-authorized journal/trade records", "Consistent outcome definitions", "User-scoped identity"],
    outputs: ["Private performance summaries", "Behaviour patterns", "Review prompts", "Data coverage warnings"],
    dependencies: ["risk-planning", "evidence-quality"],
    safetyRules: [...commonSafety, "Keep user performance and journal data private and isolated by RLS."],
    status: "PLANNED",
    version: "0.1.0",
  },
  {
    id: "fundamental-news",
    name: "Fundamental and News Intelligence",
    group: "CONTEXT",
    purpose: "Assess scheduled economic events, central-bank decisions, macro context, and event risk.",
    requiredEvidence: ["Sourced provider/caller macro items", "Absolute publication and scheduled-event timestamps", "Explicit instrument currency relevance", "Provider attribution and permitted-use verification", "Explicit freshness and event-horizon policy"],
    outputs: ["Currency-filtered macro/news evidence", "Scheduled and released data context", "Preserved actual/forecast/previous values", "Freshness, provenance and coverage warnings"],
    dependencies: ["evidence-quality", "session-timing"],
    safetyRules: [...commonSafety, "Do not invent headlines or treat unverified news as fact.", "Preserve provider impact labels without treating them as price direction.", "Never infer an economic surprise without a validated comparison methodology.", "Respect provider licensing, attribution and redistribution permissions."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "evidence-quality",
    name: "Evidence and Quality-Control Intelligence",
    group: "QUALITY",
    purpose: "Validate freshness, completeness, timestamps, source reliability, candle state, and provider disagreement.",
    requiredEvidence: ["Provider metadata", "Snapshot timestamps", "Completeness metrics", "Instrument/timeframe identity"],
    outputs: ["Evidence readiness", "Data-quality findings", "Provenance map", "Unresolved conflicts"],
    dependencies: [],
    safetyRules: [...commonSafety, "Never mark data READY unless every required validation and entitlement gate passes."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "strategy-discovery",
    name: "Strategy Discovery Intelligence",
    group: "LEARNING",
    purpose: "Propose candidate strategy hypotheses for controlled testing, not live signals.",
    requiredEvidence: ["Versioned methodology library", "Historical sample", "Research protocol", "Multiple-testing controls"],
    outputs: ["Strategy hypotheses", "Testable rule proposals", "Known failure modes", "Evaluation plan"],
    dependencies: ["backtesting", "knowledge-management", "evidence-quality"],
    safetyRules: [...commonSafety, "A discovered pattern is a hypothesis until independently validated."],
    status: "PLANNED",
    version: "0.1.0",
  },
  {
    id: "pattern-recognition",
    name: "Pattern Recognition Intelligence",
    group: "CORE_ANALYSIS",
    purpose: "Detect defined chart patterns and recurring formations with measurable criteria.",
    requiredEvidence: ["Validated candle sequence", "Pattern definitions", "Timeframe and instrument context"],
    outputs: ["Pattern candidates", "Pattern boundaries", "Confirmation/invalidation", "Detection confidence basis"],
    dependencies: ["market-structure", "evidence-quality"],
    safetyRules: [...commonSafety, "Do not claim learned recognition until evaluated on held-out examples."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "scenario-simulation",
    name: "Scenario Simulation Intelligence",
    group: "ORCHESTRATION",
    purpose: "Compare bullish, bearish, and range-bound scenarios with explicit triggers and invalidations.",
    requiredEvidence: ["Current validated context", "Scenario assumptions", "Risk geometry", "Alternative hypotheses"],
    outputs: ["Scenario set", "Trigger conditions", "Invalidation conditions", "Scenario comparison"],
    dependencies: ["market-structure", "liquidity", "multi-timeframe", "risk-planning"],
    safetyRules: [...commonSafety, "Keep scenarios conditional; do not turn a scenario into an active order without its trigger."],
    status: "PLANNED",
    version: "0.1.0",
  },
  {
    id: "contradiction-detection",
    name: "Contradiction Detection Intelligence",
    group: "QUALITY",
    purpose: "Challenge conclusions by identifying inconsistent evidence, assumptions, levels, and system outputs.",
    requiredEvidence: ["Independent skill outputs", "Source references", "Rule-set versions", "Conflict precedence policy"],
    outputs: ["Conflict register", "Severity", "Affected conclusions", "Resolution requirements"],
    dependencies: ["evidence-quality", "scenario-simulation"],
    safetyRules: [...commonSafety, "Unresolved material contradictions must block directional approval."],
    status: "PLANNED",
    version: "0.1.0",
  },
  {
    id: "confidence-calibration",
    name: "Confidence Calibration Intelligence",
    group: "QUALITY",
    purpose: "Calibrate probability estimates against out-of-sample outcomes and report uncertainty.",
    requiredEvidence: ["Sufficient labelled historical outcomes", "Stable outcome horizon", "Out-of-sample evaluation", "Calibration metrics"],
    outputs: ["Calibration report", "Reliability curves", "Sample-size warnings", "Approved/withheld confidence status"],
    dependencies: ["backtesting", "performance-behaviour", "evidence-quality"],
    safetyRules: [...commonSafety, "Do not emit a numerical confidence score before adequate out-of-sample calibration."],
    status: "PLANNED",
    version: "0.1.0",
  },
  {
    id: "scalp-microstructure",
    name: "Scalping Microstructure Perception",
    group: "SCALPING",
    purpose: "Describe short-horizon liquidity, spread and observable order-book/tape conditions from venue-specific, timestamped data.",
    requiredEvidence: ["Entitled venue-specific depth snapshots or updates", "Timestamped bid/ask and trade prints where available", "Sequence and clock-quality metadata", "Explicit venue and instrument identity"],
    outputs: ["Observed depth/imbalance metrics", "Spread and liquidity state", "Trade-flow observations", "Data coverage and venue limitations"],
    dependencies: ["evidence-quality", "instrument-specialist"],
    safetyRules: [...commonSafety, "Never describe one venue as a consolidated Forex order book.", "Do not claim iceberg, spoofing, layering or queue position unless the feed and method can actually support that inference.", "Distinguish observed liquidity from inferred or fleeting liquidity.", "No order placement or routing."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "scalp-ultra-short-signals",
    name: "Ultra-Short-Term Intelligence",
    group: "SCALPING",
    purpose: "Identify configured tick/sub-minute momentum, micro-reversion, volume-delta and micro-regime candidates.",
    requiredEvidence: ["Validated tick or sub-minute observations", "Sequence-complete timestamped trades/quotes", "Explicit sampling and pattern policy", "Spread and volatility context"],
    outputs: ["Short-horizon pattern candidates", "Micro-regime classification", "Flow and volume observations", "Invalidation and evidence limitations"],
    dependencies: ["evidence-quality", "scalp-microstructure", "pattern-recognition"],
    safetyRules: [...commonSafety, "Never infer tick-level behaviour from ordinary OHLC candles.", "No signal without explicit horizon, sampling and confirmation rules.", "Treat news-driven or incomplete sequences as degraded."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "scalp-latency-execution",
    name: "Scalping Latency and Execution Intelligence",
    group: "SCALPING",
    purpose: "Measure observed data/decision/execution latency and estimate execution quality from authorized records.",
    requiredEvidence: ["Timestamped quote, decision and fill records", "Clock synchronization and measurement definitions", "Broker/venue-specific execution metadata", "Explicit cost and slippage policy"],
    outputs: ["Latency distributions", "Observed slippage and fill-quality summaries", "Execution-quality warnings", "Measurement uncertainty"],
    dependencies: ["evidence-quality", "instrument-specialist", "scalp-cost-edge"],
    safetyRules: [...commonSafety, "Do not claim predictive venue latency without adequate measured history.", "No smart order routing, queue joining, IOC submission or broker write access.", "Separate measured execution facts from hypothetical estimates."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "scalp-micro-risk",
    name: "Scalping Micro Risk and Inventory Intelligence",
    group: "SCALPING",
    purpose: "Evaluate explicit tick/basis-point risk limits, session exposure and user-supplied inventory without executing trades.",
    requiredEvidence: ["User-authorized position/fill records", "Validated instrument tick and contract metadata", "Explicit per-trade/session limits", "Fresh quote and volatility inputs"],
    outputs: ["Risk-limit state", "Inventory/exposure summaries", "Size-reduction or pause warnings", "Circuit-breaker status"],
    dependencies: ["evidence-quality", "instrument-specialist", "risk-planning"],
    safetyRules: [...commonSafety, "Never invent balances, positions, tick values or contract specifications.", "No automatic position sizing submission, order reduction or trade shutdown action.", "Missing or stale inventory data blocks claims of current exposure."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "scalp-cost-edge",
    name: "Scalping Cost-Aware Edge Intelligence",
    group: "SCALPING",
    purpose: "Compare explicitly defined expected opportunity with round-trip spread, commission, fees, rebates and slippage assumptions.",
    requiredEvidence: ["Executable bid/ask or documented quote source", "Broker-specific commission/fee schedule", "Explicit slippage assumptions with provenance", "Strategy-defined gross edge and evaluation horizon"],
    outputs: ["Round-trip cost breakdown", "Net expected edge range", "Edge-to-cost ratio", "Cost-data coverage and sensitivity warnings"],
    dependencies: ["evidence-quality", "instrument-specialist"],
    safetyRules: [...commonSafety, "Never treat candle close as an executable quote.", "Never omit spread, commission or known fees from cost totals.", "Unknown cost components must remain unknown and block a positive net-edge claim.", "Rebates count only when verified and applicable."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "scalp-context",
    name: "Scalping Session and Context Intelligence",
    group: "SCALPING",
    purpose: "Assess short-horizon session phase, event proximity, volatility changes and cross-asset context using sourced observations.",
    requiredEvidence: ["Sourced session observations", "Verified event windows and explicit instrument currency relevance", "Timestamped volatility observations with baseline", "Timestamped cross-asset correlation observations"],
    outputs: ["Supplied session-phase context", "Relevant event windows", "Volatility-to-baseline comparisons", "Descriptive cross-asset correlations and coverage warnings"],
    dependencies: ["evidence-quality", "session-timing", "fundamental-news"],
    safetyRules: [...commonSafety, "Do not infer event absence from a missing calendar feed.", "Cross-asset correlation is descriptive, not causal or predictive.", "No automatic pause/size change action; provide warnings only."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "scalp-adaptive-strategy",
    name: "Scalping Adaptive Strategy Intelligence",
    group: "SCALPING",
    purpose: "Compare approved momentum, mean-reversion and market-making research modes against explicit regime and cost requirements.",
    requiredEvidence: ["Versioned candidate strategy rules", "Validated context and observed regime labels", "Verified cost gate", "Fresh out-of-sample evaluation with sample and drawdown metrics"],
    outputs: ["Research-only candidate suitability", "Regime mismatch warnings", "Cost/sample/drawdown gate results", "Reasons to abstain from further evaluation"],
    dependencies: ["scalp-ultra-short-signals", "scalp-cost-edge", "scalp-context", "backtesting"],
    safetyRules: [...commonSafety, "No autonomous live strategy switching or trade-frequency changes.", "Market-making mode remains research-only unless separately authorized and supported.", "Never select a strategy solely from in-sample performance."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "scalp-behaviour-guardrails",
    name: "Scalping Behaviour and Discipline Intelligence",
    group: "SCALPING",
    purpose: "Analyze user-authorized trading records for overtrading, revenge-trading proxies, size escalation, fatigue proxies and outcome attribution.",
    requiredEvidence: ["Explicit user authorization and private-only scope", "Timestamped private trade/journal records", "Consistent outcomes, position sizes and strategy tags", "Explicit frequency, loss-streak and size-escalation policy"],
    outputs: ["Trade-frequency and loss-streak observations", "Post-loss size-escalation proxies", "Private strategy attribution summaries", "Coverage and interpretation limitations"],
    dependencies: ["performance-behaviour", "risk-planning", "evidence-quality"],
    safetyRules: [...commonSafety, "Do not diagnose psychological or medical conditions.", "Treat revenge-trading and fatigue as behavioural hypotheses, not facts.", "Keep records private to the user and do not pool them into shared learning.", "No automatic trading lockout or account action."],
    status: "IN_DEVELOPMENT",
    version: "0.1.0",
  },
  {
    id: "knowledge-management",
    name: "Knowledge Management Intelligence",
    group: "ORCHESTRATION",
    purpose: "Version methodology, preserve provenance, manage experiments, and govern candidate Core Brain improvements.",
    requiredEvidence: ["Versioned rule changes", "Experiment records", "Review/approval records", "Compatibility and evaluation results"],
    outputs: ["Knowledge versions", "Change proposals", "Experiment registry", "Approval and rollback history"],
    dependencies: ["backtesting", "evidence-quality", "contradiction-detection"],
    safetyRules: [...commonSafety, "Shared Core Brain changes require controlled tests and owner approval.", "Never pool private user journals into shared learning by default."],
    status: "PLANNED",
    version: "0.1.0",
  },
] as const;

export function getBrainSkill(id: string): BrainSkillDefinition | undefined {
  return TRADING_BRAIN_SKILLS.find((skill) => skill.id === id);
}

export function getBrainSkillsByGroup(group: BrainSkillGroup): BrainSkillDefinition[] {
  return TRADING_BRAIN_SKILLS.filter((skill) => skill.group === group);
}

export function getBrainSkillReadiness(): {
  total: number;
  inDevelopment: number;
  implemented: number;
  tested: number;
  enabled: number;
  planned: number;
} {
  return {
    total: TRADING_BRAIN_SKILLS.length,
    inDevelopment: TRADING_BRAIN_SKILLS.filter((skill) => skill.status === "IN_DEVELOPMENT").length,
    implemented: TRADING_BRAIN_SKILLS.filter((skill) =>
      skill.status === "IMPLEMENTED" || skill.status === "TESTED" || skill.status === "ENABLED"
    ).length,
    tested: TRADING_BRAIN_SKILLS.filter((skill) =>
      skill.status === "TESTED" || skill.status === "ENABLED"
    ).length,
    enabled: TRADING_BRAIN_SKILLS.filter((skill) => skill.status === "ENABLED").length,
    planned: TRADING_BRAIN_SKILLS.filter((skill) => skill.status === "PLANNED").length,
  };
}
