import type { BrainSkillResult, SkillSourceReference } from "../types";

export type ScalpingContextState = "ACTIVE" | "UPCOMING" | "OUTSIDE_WINDOW" | "UNAVAILABLE";
export type VolatilityState = "ELEVATED" | "NOT_ELEVATED" | "UNCLASSIFIED";

export interface ScalpingSessionObservation {
  id: string;
  name: string;
  phase: string;
  observedAt: string;
  sourceReferences: SkillSourceReference[];
}

export interface ScalpingEventObservation {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  impact: "LOW" | "MEDIUM" | "HIGH" | "UNSPECIFIED";
  currencies: string[];
  sourceReferences: SkillSourceReference[];
}

export interface ScalpingVolatilityObservation {
  id: string;
  instrument: string;
  timeframe: string;
  observedAt: string;
  metricName: string;
  value: number;
  baseline: number;
  unit: string;
  sourceReferences: SkillSourceReference[];
}

export interface ScalpingCorrelationObservation {
  id: string;
  instrument: string;
  comparisonInstrument: string;
  observedAt: string;
  window: string;
  coefficient: number;
  sourceReferences: SkillSourceReference[];
}

export interface ScalpingContextInput {
  instrument: string;
  instrumentCurrencies: string[];
  asOf: string;
  sessions: ScalpingSessionObservation[];
  events: ScalpingEventObservation[];
  volatility: ScalpingVolatilityObservation[];
  correlations: ScalpingCorrelationObservation[];
}

export interface ScalpingContextPolicy {
  maximumObservationAgeSeconds: number;
  upcomingEventHorizonSeconds: number;
  elevatedVolatilityRatio: number;
  requireProvenance: boolean;
}

export interface ScalpingContextAssessment {
  instrument: string;
  sessionState: ScalpingContextState;
  sessionPhases: Array<{ id: string; name: string; phase: string }>;
  relevantEvents: Array<{
    id: string;
    title: string;
    impact: ScalpingEventObservation["impact"];
    state: "IN_PROGRESS" | "UPCOMING" | "OUTSIDE_WINDOW";
    matchedCurrencies: string[];
    secondsUntilStart: number;
  }>;
  volatility: Array<{
    id: string;
    instrument: string;
    timeframe: string;
    metricName: string;
    value: number;
    baseline: number;
    unit: string;
    ratio: number;
    state: VolatilityState;
  }>;
  correlations: Array<{
    id: string;
    comparisonInstrument: string;
    window: string;
    coefficient: number;
  }>;
}

export interface ScalpingContextFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "INVALID_AS_OF"
    | "INSTRUMENT_CURRENCIES_MISSING"
    | "SESSION_DATA_MISSING"
    | "INVALID_OBSERVATION"
    | "OBSERVATION_STALE"
    | "PROVENANCE_MISSING"
    | "INVALID_EVENT_WINDOW"
    | "INVALID_VOLATILITY"
    | "INVALID_CORRELATION";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "scalp-context/0.1.0";

function timestamp(value: string): number {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return Number.NaN;
  return Date.parse(value);
}

function emptyAssessment(instrument: string): ScalpingContextAssessment {
  return {
    instrument,
    sessionState: "UNAVAILABLE",
    sessionPhases: [],
    relevantEvents: [],
    volatility: [],
    correlations: [],
  };
}

function result(
  input: ScalpingContextInput,
  findings: ScalpingContextFinding[],
  assessment: ScalpingContextAssessment,
  status: BrainSkillResult<ScalpingContextFinding>["status"],
  readiness: BrainSkillResult<ScalpingContextFinding>["evidenceReadiness"],
): BrainSkillResult<ScalpingContextFinding> & { assessment: ScalpingContextAssessment } {
  const refs = [
    ...input.sessions.flatMap((item) => Array.isArray(item.sourceReferences) ? item.sourceReferences : []),
    ...input.events.flatMap((item) => Array.isArray(item.sourceReferences) ? item.sourceReferences : []),
    ...input.volatility.flatMap((item) => Array.isArray(item.sourceReferences) ? item.sourceReferences : []),
    ...input.correlations.flatMap((item) => Array.isArray(item.sourceReferences) ? item.sourceReferences : []),
  ];
  return {
    skillId: "scalp-context",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: [
      `Session state: ${assessment.sessionState.toLowerCase()}.`,
      ...assessment.sessionPhases.map((item) => `${item.name}: supplied phase ${item.phase}.`),
      ...assessment.relevantEvents.map((item) => `${item.title}: ${item.state.toLowerCase().replaceAll("_", " ")}.`),
      ...assessment.volatility.map((item) => `${item.instrument} ${item.timeframe} ${item.metricName}: ${item.state.toLowerCase()}.`),
      ...assessment.correlations.map((item) => `${input.instrument}/${item.comparisonInstrument} observed correlation ${item.coefficient} over ${item.window}.`),
    ],
    interpretations: assessment.relevantEvents.some((item) => item.state !== "OUTSIDE_WINDOW")
      ? ["A supplied relevant event window is active or approaching; treat this as context, not a directional forecast."]
      : [],
    supportingEvidence: [],
    contraryEvidence: [],
    uncertainties: [
      "All session, event, volatility and correlation observations are caller-supplied; this module does not fetch live feeds.",
      "An empty event list does not establish that no event risk exists; calendar coverage must be verified by the caller.",
      "Correlation is descriptive over the supplied window and does not establish causation or predict future co-movement.",
      "A volatility ratio compares only the supplied metric and baseline; it is not a universal market-regime classification.",
    ],
    sourceReferences: refs,
    limitations: [
      "No automatic news pause, risk change, position sizing, strategy switch or order action is performed.",
      "Session phase labels are reported as supplied and are not independently verified market-open determinations.",
      "This module does not generate BUY, SELL, entry, stop, target or confidence outputs.",
    ],
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

/** Summarize supplied scalping context without discovering or inferring live market conditions. */
export function assessScalpingContext(
  input: ScalpingContextInput,
  policy?: ScalpingContextPolicy,
): BrainSkillResult<ScalpingContextFinding> & { assessment: ScalpingContextAssessment } {
  if (!policy) {
    return result(input, [{ code: "POLICY_MISSING", message: "Explicit freshness, event-horizon and volatility policies are required." }], emptyAssessment(input.instrument), "INCOMPLETE", "INCOMPLETE");
  }
  if (
    !Number.isFinite(policy.maximumObservationAgeSeconds) || policy.maximumObservationAgeSeconds < 0 ||
    !Number.isFinite(policy.upcomingEventHorizonSeconds) || policy.upcomingEventHorizonSeconds < 0 ||
    !Number.isFinite(policy.elevatedVolatilityRatio) || policy.elevatedVolatilityRatio <= 0 ||
    typeof policy.requireProvenance !== "boolean"
  ) {
    return result(input, [{ code: "INVALID_POLICY", message: "Policy thresholds must be explicit, finite and valid." }], emptyAssessment(input.instrument), "REJECTED", "INCOMPLETE");
  }
  const asOf = timestamp(input.asOf);
  if (!Number.isFinite(asOf)) {
    return result(input, [{ code: "INVALID_AS_OF", message: "Evaluation time must be an absolute timestamp with timezone." }], emptyAssessment(input.instrument), "REJECTED", "INCOMPLETE");
  }
  if (!Array.isArray(input.instrumentCurrencies) || input.instrumentCurrencies.length === 0) {
    return result(input, [{ code: "INSTRUMENT_CURRENCIES_MISSING", message: "Explicit instrument currency relevance is required." }], emptyAssessment(input.instrument), "INCOMPLETE", "INCOMPLETE");
  }
  if (!Array.isArray(input.sessions) || input.sessions.length === 0) {
    return result(input, [{ code: "SESSION_DATA_MISSING", message: "At least one supplied session observation is required; missing data cannot establish session state." }], emptyAssessment(input.instrument), "INCOMPLETE", "INCOMPLETE");
  }

  const findings: ScalpingContextFinding[] = [];
  const validRefs = (refs: SkillSourceReference[]) => Array.isArray(refs) && refs.length > 0 &&
    refs.every((ref) => ref.sourceId && ref.providerId && ref.instrument && ref.timeframe &&
      Number.isFinite(timestamp(ref.observedAt)) && Number.isFinite(timestamp(ref.receivedAt)) &&
      timestamp(ref.observedAt) <= asOf && timestamp(ref.receivedAt) <= asOf);
  const fresh = (observedAt: string) => {
    const at = timestamp(observedAt);
    return Number.isFinite(at) && at <= asOf &&
      (asOf - at) / 1000 <= policy.maximumObservationAgeSeconds;
  };
  const check = (refs: SkillSourceReference[], label: string) => {
    if (policy.requireProvenance && !validRefs(refs)) {
      findings.push({ code: "PROVENANCE_MISSING", message: `${label} lacks valid, non-future source provenance.` });
      return false;
    }
    return true;
  };

  const sessionPhases: ScalpingContextAssessment["sessionPhases"] = [];
  for (const item of input.sessions) {
    if (!item.id || !item.name || !item.phase || !fresh(item.observedAt)) {
      findings.push({ code: "INVALID_OBSERVATION", message: `Session observation ${item.id || "(unnamed)"} is invalid or has a future timestamp.` });
      continue;
    }
    if (!fresh(item.observedAt)) {
      findings.push({ code: "OBSERVATION_STALE", message: `Session observation ${item.id} is stale.` });
      continue;
    }
    if (check(item.sourceReferences, `Session observation ${item.id}`)) {
      sessionPhases.push({ id: item.id, name: item.name, phase: item.phase });
    }
  }

  const currencies = input.instrumentCurrencies.map((value) => value.toUpperCase());
  const relevantEvents: ScalpingContextAssessment["relevantEvents"] = [];
  for (const event of input.events) {
    const start = timestamp(event.startsAt);
    const end = timestamp(event.endsAt);
    if (!event.id || !event.title || !Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
      !["LOW", "MEDIUM", "HIGH", "UNSPECIFIED"].includes(event.impact) ||
      !Array.isArray(event.currencies) || event.currencies.length === 0) {
      findings.push({ code: "INVALID_EVENT_WINDOW", message: `Event ${event.id || "(unnamed)"} has an invalid window or relevance metadata.` });
      continue;
    }
    const matchedCurrencies = [...new Set(event.currencies.map((value) => value.toUpperCase()))].filter((value) => currencies.includes(value));
    if (!matchedCurrencies.length) continue;
    if (!check(event.sourceReferences, `Event ${event.id}`)) continue;
    const secondsUntilStart = (start - asOf) / 1000;
    const state = asOf >= start && asOf < end ? "IN_PROGRESS"
      : secondsUntilStart > 0 && secondsUntilStart <= policy.upcomingEventHorizonSeconds ? "UPCOMING"
      : "OUTSIDE_WINDOW";
    relevantEvents.push({ id: event.id, title: event.title, impact: event.impact, state, matchedCurrencies, secondsUntilStart });
  }

  const volatility: ScalpingContextAssessment["volatility"] = [];
  for (const item of input.volatility) {
    if (!item.id || !item.instrument || !item.timeframe || !item.metricName || !item.unit ||
      !Number.isFinite(item.value) || !Number.isFinite(item.baseline) || item.value < 0 || item.baseline <= 0) {
      findings.push({ code: "INVALID_VOLATILITY", message: `Volatility observation ${item.id || "(unnamed)"} has invalid values or identity.` });
      continue;
    }
    if (!fresh(item.observedAt)) {
      findings.push({ code: "OBSERVATION_STALE", message: `Volatility observation ${item.id} is stale or has a future timestamp.` });
      continue;
    }
    if (!check(item.sourceReferences, `Volatility observation ${item.id}`)) continue;
    const ratio = item.value / item.baseline;
    volatility.push({
      id: item.id, instrument: item.instrument, timeframe: item.timeframe,
      metricName: item.metricName, value: item.value, baseline: item.baseline, unit: item.unit,
      ratio, state: ratio >= policy.elevatedVolatilityRatio ? "ELEVATED" : "NOT_ELEVATED",
    });
  }

  const correlations: ScalpingContextAssessment["correlations"] = [];
  for (const item of input.correlations) {
    if (!item.id || !item.instrument || !item.comparisonInstrument || !item.window ||
      !Number.isFinite(item.coefficient) || item.coefficient < -1 || item.coefficient > 1) {
      findings.push({ code: "INVALID_CORRELATION", message: `Correlation observation ${item.id || "(unnamed)"} is invalid.` });
      continue;
    }
    if (!fresh(item.observedAt)) {
      findings.push({ code: "OBSERVATION_STALE", message: `Correlation observation ${item.id} is stale or has a future timestamp.` });
      continue;
    }
    if (!check(item.sourceReferences, `Correlation observation ${item.id}`)) continue;
    correlations.push({ id: item.id, comparisonInstrument: item.comparisonInstrument, window: item.window, coefficient: item.coefficient });
  }

  const blocked = findings.length > 0 || sessionPhases.length === 0;
  const assessment: ScalpingContextAssessment = {
    instrument: input.instrument,
    sessionState: blocked ? "UNAVAILABLE" : "ACTIVE",
    sessionPhases,
    relevantEvents: relevantEvents.sort((a, b) => a.secondsUntilStart - b.secondsUntilStart),
    volatility,
    correlations,
  };
  return result(input, findings, assessment, blocked ? "INCOMPLETE" : "COMPLETE", blocked ? "DEGRADED" : "READY");
}
