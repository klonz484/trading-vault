import type { BrainSkillResult, SkillSourceReference } from "../types";

export interface ScalpingBehaviourRecord {
  id: string;
  openedAt: string;
  closedAt: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  lots: number;
  outcome: "WIN" | "LOSS" | "FLAT";
  pnlTicks: number;
  strategyTag: string;
  sourceReferences: SkillSourceReference[];
}

export interface ScalpingBehaviourInput {
  userAuthorized: boolean;
  privacyScope: "PRIVATE_USER_ONLY" | "UNCONFIRMED";
  instrument: string;
  asOf: string;
  records: ScalpingBehaviourRecord[];
}

export interface ScalpingBehaviourPolicy {
  minimumRecords: number;
  maximumRecordAgeSeconds: number;
  frequencyWindowSeconds: number;
  maximumTradesPerWindow: number;
  maximumConsecutiveLosses: number;
  sizeEscalationRatio: number;
  requireProvenance: boolean;
}

export interface ScalpingBehaviourAssessment {
  instrument: string;
  recordsReviewed: number;
  tradesInFrequencyWindow: number;
  frequencyLimitExceeded: boolean | null;
  maximumConsecutiveLossesObserved: number;
  lossStreakLimitExceeded: boolean | null;
  sizeEscalationObservations: Array<{ recordId: string; previousRecordId: string; ratio: number }>;
  strategyAttribution: Array<{ strategyTag: string; trades: number; wins: number; losses: number; netPnlTicks: number }>;
  privateScopeConfirmed: boolean;
  warningsOnly: true;
}

export interface ScalpingBehaviourFinding {
  code:
    | "AUTHORIZATION_REQUIRED"
    | "PRIVATE_SCOPE_REQUIRED"
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "INVALID_AS_OF"
    | "HISTORY_INSUFFICIENT"
    | "INVALID_RECORD"
    | "RECORD_STALE"
    | "PROVENANCE_MISSING";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "scalp-behaviour-guardrails/0.1.0";

function timestamp(value: string): number {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return Number.NaN;
  return Date.parse(value);
}

function emptyAssessment(instrument: string, privateScopeConfirmed = false): ScalpingBehaviourAssessment {
  return {
    instrument,
    recordsReviewed: 0,
    tradesInFrequencyWindow: 0,
    frequencyLimitExceeded: null,
    maximumConsecutiveLossesObserved: 0,
    lossStreakLimitExceeded: null,
    sizeEscalationObservations: [],
    strategyAttribution: [],
    privateScopeConfirmed,
    warningsOnly: true,
  };
}

function result(
  input: ScalpingBehaviourInput,
  findings: ScalpingBehaviourFinding[],
  assessment: ScalpingBehaviourAssessment,
  status: BrainSkillResult<ScalpingBehaviourFinding>["status"],
  readiness: BrainSkillResult<ScalpingBehaviourFinding>["evidenceReadiness"],
): BrainSkillResult<ScalpingBehaviourFinding> & { assessment: ScalpingBehaviourAssessment } {
  return {
    skillId: "scalp-behaviour-guardrails",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: [
      `Reviewed ${assessment.recordsReviewed} private trade records.`,
      `Trades in configured frequency window: ${assessment.tradesInFrequencyWindow}.`,
      `Maximum observed consecutive losses: ${assessment.maximumConsecutiveLossesObserved}.`,
      ...assessment.sizeEscalationObservations.map((item) =>
        `Trade ${item.recordId} size was ${item.ratio.toFixed(2)}x the previous trade after a loss.`
      ),
    ],
    interpretations: [
      "These are observable trading-pattern flags only; they do not establish intent, emotional state, fatigue, or a psychological condition.",
    ],
    supportingEvidence: [],
    contraryEvidence: [],
    uncertainties: [
      "The module sees only the user-authorized records supplied to this assessment; missing records can hide activity.",
      "Strategy attribution depends on caller-supplied strategy tags and consistent outcome reporting.",
      "A size increase after a loss is a behavioural proxy, not proof of revenge trading.",
      "Frequency and loss-streak thresholds are user-configured guardrails, not universal standards.",
    ],
    sourceReferences: input.records.flatMap((record) => Array.isArray(record.sourceReferences) ? record.sourceReferences : []),
    limitations: [
      "Records remain private to the user and are not pooled into shared Core Brain learning.",
      "No psychological or medical diagnosis is made.",
      "Warnings only: no trade lockout, order cancellation, size adjustment, account action or execution.",
    ],
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

/** Inspect user-authorized private trading records for explicit, observable discipline proxies only. */
export function assessScalpingBehaviour(
  input: ScalpingBehaviourInput,
  policy?: ScalpingBehaviourPolicy,
): BrainSkillResult<ScalpingBehaviourFinding> & { assessment: ScalpingBehaviourAssessment } {
  if (input.userAuthorized !== true) {
    return result(input, [{ code: "AUTHORIZATION_REQUIRED", message: "Explicit user authorization is required before reviewing private trading records." }], emptyAssessment(input.instrument), "REJECTED", "UNAVAILABLE");
  }
  if (input.privacyScope !== "PRIVATE_USER_ONLY") {
    return result(input, [{ code: "PRIVATE_SCOPE_REQUIRED", message: "Behaviour records must remain within the individual user's private scope." }], emptyAssessment(input.instrument), "REJECTED", "UNAVAILABLE");
  }
  if (!policy) {
    return result(input, [{ code: "POLICY_MISSING", message: "Explicit history, freshness, frequency, loss-streak and size-escalation thresholds are required." }], emptyAssessment(input.instrument, true), "INCOMPLETE", "INCOMPLETE");
  }
  if (
    !Number.isInteger(policy.minimumRecords) || policy.minimumRecords < 1 ||
    !Number.isFinite(policy.maximumRecordAgeSeconds) || policy.maximumRecordAgeSeconds < 0 ||
    !Number.isFinite(policy.frequencyWindowSeconds) || policy.frequencyWindowSeconds <= 0 ||
    !Number.isInteger(policy.maximumTradesPerWindow) || policy.maximumTradesPerWindow < 1 ||
    !Number.isInteger(policy.maximumConsecutiveLosses) || policy.maximumConsecutiveLosses < 1 ||
    !Number.isFinite(policy.sizeEscalationRatio) || policy.sizeEscalationRatio <= 1 ||
    typeof policy.requireProvenance !== "boolean"
  ) {
    return result(input, [{ code: "INVALID_POLICY", message: "All behaviour thresholds must be explicit, finite and valid." }], emptyAssessment(input.instrument, true), "REJECTED", "INCOMPLETE");
  }
  const asOf = timestamp(input.asOf);
  if (!Number.isFinite(asOf)) {
    return result(input, [{ code: "INVALID_AS_OF", message: "Evaluation time must be an absolute timestamp with timezone." }], emptyAssessment(input.instrument, true), "REJECTED", "INCOMPLETE");
  }
  if (!Array.isArray(input.records) || input.records.length < policy.minimumRecords) {
    return result(input, [{ code: "HISTORY_INSUFFICIENT", message: "The supplied private history is below the explicit minimum record count." }], emptyAssessment(input.instrument, true), "INCOMPLETE", "INCOMPLETE");
  }

  const findings: ScalpingBehaviourFinding[] = [];
  const records: Array<ScalpingBehaviourRecord & { openedAtMs: number; closedAtMs: number }> = [];
  const ids = new Set<string>();
  for (const record of input.records) {
    const openedAtMs = timestamp(record.openedAt);
    const closedAtMs = timestamp(record.closedAt);
    if (!record.id || ids.has(record.id) || record.instrument !== input.instrument ||
      !["LONG", "SHORT"].includes(record.direction) ||
      !["WIN", "LOSS", "FLAT"].includes(record.outcome) ||
      !Number.isFinite(record.lots) || record.lots <= 0 ||
      !Number.isFinite(record.pnlTicks) ||
      !record.strategyTag || !Number.isFinite(openedAtMs) || !Number.isFinite(closedAtMs) ||
      closedAtMs < openedAtMs || closedAtMs > asOf) {
      findings.push({ code: "INVALID_RECORD", message: `Trade record ${record.id || "(unnamed)"} is invalid or mismatched.` });
      continue;
    }
    ids.add(record.id);
    if ((asOf - closedAtMs) / 1000 > policy.maximumRecordAgeSeconds) {
      findings.push({ code: "RECORD_STALE", message: `Trade record ${record.id} is outside the configured history freshness window.` });
      continue;
    }
    if (policy.requireProvenance) {
      const valid = Array.isArray(record.sourceReferences) && record.sourceReferences.length > 0 &&
        record.sourceReferences.every((ref) => ref.sourceId && ref.providerId &&
          ref.instrument === input.instrument && ref.timeframe === "trade" &&
          Number.isFinite(timestamp(ref.observedAt)) && Number.isFinite(timestamp(ref.receivedAt)) &&
          timestamp(ref.observedAt) <= asOf && timestamp(ref.receivedAt) <= asOf);
      if (!valid) {
        findings.push({ code: "PROVENANCE_MISSING", message: `Trade record ${record.id} lacks matching private-record provenance.` });
        continue;
      }
    }
    records.push({ ...record, openedAtMs, closedAtMs });
  }
  if (findings.length > 0 || records.length < policy.minimumRecords) {
    if (records.length < policy.minimumRecords && findings.length === 0) {
      findings.push({ code: "HISTORY_INSUFFICIENT", message: "Too few valid, fresh records remain after validation." });
    }
    return result(input, findings, emptyAssessment(input.instrument, true), "INCOMPLETE", "DEGRADED");
  }

  records.sort((a, b) => a.closedAtMs - b.closedAtMs);
  const windowStart = asOf - policy.frequencyWindowSeconds * 1000;
  const tradesInFrequencyWindow = records.filter((record) => record.openedAtMs >= windowStart && record.openedAtMs <= asOf).length;
  let currentLossStreak = 0;
  let maximumConsecutiveLossesObserved = 0;
  const sizeEscalationObservations: ScalpingBehaviourAssessment["sizeEscalationObservations"] = [];
  for (let index = 0; index < records.length; index += 1) {
    const current = records[index];
    currentLossStreak = current.outcome === "LOSS" ? currentLossStreak + 1 : 0;
    maximumConsecutiveLossesObserved = Math.max(maximumConsecutiveLossesObserved, currentLossStreak);
    const previous = records[index - 1];
    if (previous?.outcome === "LOSS" && current.lots / previous.lots >= policy.sizeEscalationRatio) {
      sizeEscalationObservations.push({
        recordId: current.id,
        previousRecordId: previous.id,
        ratio: current.lots / previous.lots,
      });
    }
  }

  const attribution = new Map<string, { trades: number; wins: number; losses: number; netPnlTicks: number }>();
  for (const record of records) {
    const entry = attribution.get(record.strategyTag) ?? { trades: 0, wins: 0, losses: 0, netPnlTicks: 0 };
    entry.trades += 1;
    if (record.outcome === "WIN") entry.wins += 1;
    if (record.outcome === "LOSS") entry.losses += 1;
    entry.netPnlTicks += record.pnlTicks;
    attribution.set(record.strategyTag, entry);
  }
  const assessment: ScalpingBehaviourAssessment = {
    instrument: input.instrument,
    recordsReviewed: records.length,
    tradesInFrequencyWindow,
    frequencyLimitExceeded: tradesInFrequencyWindow > policy.maximumTradesPerWindow,
    maximumConsecutiveLossesObserved,
    lossStreakLimitExceeded: maximumConsecutiveLossesObserved > policy.maximumConsecutiveLosses,
    sizeEscalationObservations,
    strategyAttribution: [...attribution.entries()].map(([strategyTag, values]) => ({ strategyTag, ...values })),
    privateScopeConfirmed: true,
    warningsOnly: true,
  };
  return result(input, [], assessment, "COMPLETE", "READY");
}
