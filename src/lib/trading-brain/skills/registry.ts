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
  | "ORCHESTRATION";

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
    dependencies: ["evidence-quality", "multi-timeframe"],
    safetyRules: [...commonSafety, "Never promote a provisional forming-candle event to confirmed structure."],
    status: "PLANNED",
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
    status: "PLANNED",
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
    safetyRules: [...commonSafety, "Do not label every candle or gap as an institutional zone."],
    status: "PLANNED",
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
    safetyRules: [...commonSafety, "Never infer an unavailable higher timeframe from a lower-timeframe screenshot."],
    status: "PLANNED",
    version: "0.1.0",
  },
  {
    id: "session-timing",
    name: "Session and Timing Intelligence",
    group: "CONTEXT",
    purpose: "Evaluate trading sessions, session ranges, timing windows, volatility conditions, and event proximity.",
    requiredEvidence: ["Timezone-aware timestamps", "Session calendar", "Instrument trading hours", "Validated volatility inputs"],
    outputs: ["Session state", "Timing context", "Session range", "Event/timing limitations"],
    dependencies: ["evidence-quality", "fundamental-news"],
    safetyRules: [...commonSafety, "Handle daylight-saving transitions and market holidays explicitly."],
    status: "PLANNED",
    version: "0.1.0",
  },
  {
    id: "indicator",
    name: "Indicator Intelligence",
    group: "CORE_ANALYSIS",
    purpose: "Calculate and interpret approved indicators as supporting or contrary evidence.",
    requiredEvidence: ["Sufficient validated OHLC history", "Indicator definitions and parameters", "Warm-up periods"],
    outputs: ["Indicator values", "Calculation provenance", "Supporting/contrary signals"],
    dependencies: ["evidence-quality"],
    safetyRules: [...commonSafety, "Indicators are supporting evidence and cannot independently force BUY or SELL."],
    status: "PLANNED",
    version: "0.1.0",
  },
  {
    id: "instrument-specialist",
    name: "Forex and Gold Specialist Intelligence",
    group: "CONTEXT",
    purpose: "Apply instrument-specific precision, pip/tick, spread, session, volatility, and contract conventions.",
    requiredEvidence: ["Validated instrument metadata", "Quote currency/base currency", "Tick and lot specifications", "Current spread provenance"],
    outputs: ["Instrument profile", "Precision rules", "Cost and volatility context", "Unsupported-instrument warnings"],
    dependencies: ["evidence-quality", "risk-planning"],
    safetyRules: [...commonSafety, "Never assume a universal pip, tick, lot, or contract size."],
    status: "PLANNED",
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
    status: "PLANNED",
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
    requiredEvidence: ["Licensed news/economic calendar source", "Publication timestamps", "Currency/instrument relevance", "Source attribution"],
    outputs: ["Event risk context", "Source-linked macro observations", "Uncertainty and freshness flags"],
    dependencies: ["evidence-quality", "session-timing"],
    safetyRules: [...commonSafety, "Do not invent headlines or treat unverified news as fact.", "Respect provider licensing and attribution."],
    status: "PLANNED",
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
    status: "PLANNED",
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
  implemented: number;
  tested: number;
  enabled: number;
  planned: number;
} {
  return {
    total: TRADING_BRAIN_SKILLS.length,
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
