import type { BrainSkillResult, SkillSourceReference } from "./types";

export interface EvidenceCandle {
  timestamp: string;
  instrument: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  isClosed: boolean;
}

export type ProviderAgreement = "AGREED" | "SINGLE_SOURCE" | "CONFLICTED";

export interface EvidenceQualityInput {
  instrument: string;
  timeframe: string;
  asOf: string;
  candles: EvidenceCandle[];
  sourceReferences: SkillSourceReference[];
  entitlementVerified: boolean;
  licenceVerified: boolean;
  providerAgreement: ProviderAgreement;
}

export interface EvidenceQualityPolicy {
  minimumCandles: number;
  expectedIntervalSeconds: number;
  maximumAgeSeconds: number;
  maximumMissingIntervals: number;
  allowSingleSource: boolean;
}

export interface EvidenceQualityFinding {
  code:
    | "POLICY_MISSING"
    | "NO_CANDLES"
    | "INSUFFICIENT_CANDLES"
    | "INVALID_TIMESTAMP"
    | "FUTURE_CANDLE"
    | "OUT_OF_ORDER_CANDLES"
    | "DUPLICATE_CANDLE"
    | "INVALID_OHLC"
    | "INSTRUMENT_MISMATCH"
    | "TIMEFRAME_MISMATCH"
    | "PROVISIONAL_CANDLE"
    | "EXCESSIVE_GAPS"
    | "STALE_DATA"
    | "ENTITLEMENT_UNVERIFIED"
    | "LICENCE_UNVERIFIED"
    | "PROVIDER_CONFLICT"
    | "SINGLE_SOURCE_NOT_ALLOWED"
    | "SOURCE_PROVENANCE_MISSING";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "evidence-quality/0.1.0";

function result(
  status: BrainSkillResult<EvidenceQualityFinding>["status"],
  readiness: BrainSkillResult<EvidenceQualityFinding>["evidenceReadiness"],
  findings: EvidenceQualityFinding[],
  input: EvidenceQualityInput,
): BrainSkillResult<EvidenceQualityFinding> {
  return {
    skillId: "evidence-quality",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: [],
    interpretations: [],
    supportingEvidence: [],
    contraryEvidence: findings.map((finding) => finding.message),
    uncertainties: [],
    sourceReferences: input.sourceReferences,
    limitations: [],
    ruleSetVersion: RULE_SET_VERSION,
  };
}

/**
 * Deterministic evidence gate. It never guesses missing thresholds:
 * a complete policy must be supplied by a separately approved configuration.
 * READY is only a data-quality result for this supplied snapshot; it does not
 * certify the provider, instrument, strategy, or Market Data Engine globally.
 */
export function assessEvidenceQuality(
  input: EvidenceQualityInput,
  policy?: EvidenceQualityPolicy,
): BrainSkillResult<EvidenceQualityFinding> {
  const findings: EvidenceQualityFinding[] = [];

  if (
    !policy ||
    !Number.isInteger(policy.minimumCandles) || policy.minimumCandles < 1 ||
    !Number.isFinite(policy.expectedIntervalSeconds) || policy.expectedIntervalSeconds <= 0 ||
    !Number.isFinite(policy.maximumAgeSeconds) || policy.maximumAgeSeconds < 0 ||
    !Number.isInteger(policy.maximumMissingIntervals) || policy.maximumMissingIntervals < 0 ||
    typeof policy.allowSingleSource !== "boolean"
  ) {
    findings.push({
      code: "POLICY_MISSING",
      message: "A complete, explicitly approved evidence-quality policy is required; thresholds are not guessed.",
    });
    return result("INCOMPLETE", "INCOMPLETE", findings, input);
  }

  if (input.candles.length === 0) {
    findings.push({ code: "NO_CANDLES", message: "No candle evidence was supplied." });
  }
  if (input.candles.length < policy.minimumCandles) {
    findings.push({
      code: "INSUFFICIENT_CANDLES",
      message: `Received ${input.candles.length} candles; policy requires ${policy.minimumCandles}.`,
    });
  }
  if (input.sourceReferences.length === 0) {
    findings.push({
      code: "SOURCE_PROVENANCE_MISSING",
      message: "No source references were supplied for the candle snapshot.",
    });
  }
  if (!input.entitlementVerified) {
    findings.push({
      code: "ENTITLEMENT_UNVERIFIED",
      message: "Provider entitlement has not been verified.",
    });
  }
  if (!input.licenceVerified) {
    findings.push({
      code: "LICENCE_UNVERIFIED",
      message: "Provider licensing has not been verified for the intended use.",
    });
  }
  if (input.providerAgreement === "CONFLICTED") {
    findings.push({
      code: "PROVIDER_CONFLICT",
      message: "Provider observations conflict; the disagreement must be investigated.",
    });
  }
  if (input.providerAgreement === "SINGLE_SOURCE" && !policy.allowSingleSource) {
    findings.push({
      code: "SINGLE_SOURCE_NOT_ALLOWED",
      message: "Policy does not permit a single-source snapshot to pass this gate.",
    });
  }

  const asOf = Date.parse(input.asOf);
  if (!Number.isFinite(asOf)) {
    findings.push({ code: "INVALID_TIMESTAMP", message: "The evaluation timestamp is invalid." });
  }

  let previousTimestamp: number | undefined;
  let missingIntervals = 0;
  let latestTimestamp: number | undefined;

  for (const candle of input.candles) {
    const timestamp = Date.parse(candle.timestamp);
    if (!Number.isFinite(timestamp)) {
      findings.push({
        code: "INVALID_TIMESTAMP",
        message: `Candle timestamp is invalid: ${candle.timestamp}.`,
      });
      continue;
    }
    if (Number.isFinite(asOf) && timestamp > asOf) {
      findings.push({
        code: "FUTURE_CANDLE",
        message: `Candle timestamp ${candle.timestamp} is later than the evaluation time.`,
      });
    }
    if (previousTimestamp !== undefined) {
      const delta = (timestamp - previousTimestamp) / 1000;
      if (delta === 0) {
        findings.push({ code: "DUPLICATE_CANDLE", message: "Duplicate candle timestamps were found." });
      } else if (delta < 0) {
        findings.push({ code: "OUT_OF_ORDER_CANDLES", message: "Candles are not in strictly ascending timestamp order." });
      } else {
        const missing = Math.max(0, Math.round(delta / policy.expectedIntervalSeconds) - 1);
        missingIntervals += missing;
      }
    }
    previousTimestamp = timestamp;
    latestTimestamp = latestTimestamp === undefined ? timestamp : Math.max(latestTimestamp, timestamp);

    if (candle.instrument !== input.instrument) {
      findings.push({ code: "INSTRUMENT_MISMATCH", message: "A candle instrument does not match the requested instrument." });
    }
    if (candle.timeframe !== input.timeframe) {
      findings.push({ code: "TIMEFRAME_MISMATCH", message: "A candle timeframe does not match the requested timeframe." });
    }
    if (!candle.isClosed) {
      findings.push({ code: "PROVISIONAL_CANDLE", message: "A forming or unconfirmed candle was supplied to the closed-candle evidence gate." });
    }

    const values = [candle.open, candle.high, candle.low, candle.close];
    if (
      values.some((value) => !Number.isFinite(value) || value <= 0) ||
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > Math.min(candle.open, candle.close) ||
      candle.high < candle.low
    ) {
      findings.push({ code: "INVALID_OHLC", message: "A candle contains invalid or internally inconsistent OHLC values." });
    }
  }

  if (missingIntervals > policy.maximumMissingIntervals) {
    findings.push({
      code: "EXCESSIVE_GAPS",
      message: `Detected ${missingIntervals} missing candle intervals; policy allows ${policy.maximumMissingIntervals}.`,
    });
  }

  if (latestTimestamp !== undefined && Number.isFinite(asOf)) {
    const ageSeconds = (asOf - latestTimestamp) / 1000;
    if (ageSeconds < 0 || ageSeconds > policy.maximumAgeSeconds) {
      findings.push({
        code: "STALE_DATA",
        message: `Latest candle age is ${ageSeconds.toFixed(0)} seconds; policy maximum is ${policy.maximumAgeSeconds}.`,
      });
    }
  }

  if (findings.length > 0) {
    const codes = new Set(findings.map((finding) => finding.code));
    const readiness = codes.has("STALE_DATA") ? "STALE"
      : codes.has("PROVIDER_CONFLICT") ? "CONFLICTED"
      : codes.has("ENTITLEMENT_UNVERIFIED") || codes.has("LICENCE_UNVERIFIED") ? "UNAVAILABLE"
      : "INCOMPLETE";
    return result("INCOMPLETE", readiness, findings, input);
  }

  return result("COMPLETE", "READY", [], input);
}
