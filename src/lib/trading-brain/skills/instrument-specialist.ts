import type { BrainSkillResult, SkillSourceReference } from "./types";

export type InstrumentAssetClass = "FOREX" | "GOLD";

export interface InstrumentSpecification {
  symbol: string;
  assetClass: InstrumentAssetClass;
  baseAsset: string;
  quoteAsset: string;
  pricePrecision: number;
  tickSize: number;
  /** FX pip definition supplied by the broker/provider; Gold may omit it. */
  pipSize: number | null;
  contractSize: number;
  minimumLot: number;
  lotStep: number;
}

export interface InstrumentQuote {
  symbol: string;
  bid: number;
  ask: number;
  observedAt: string;
}

export interface InstrumentSpecialistInput {
  specification: InstrumentSpecification;
  quote: InstrumentQuote;
  asOf: string;
  sourceReferences: SkillSourceReference[];
}

export interface InstrumentSpecialistPolicy {
  maximumQuoteAgeSeconds: number;
  maximumSpreadInPrice: number;
  requireSourceProvenance: boolean;
}

export interface InstrumentSpecialistAssessment {
  symbol: string;
  assetClass: InstrumentAssetClass;
  metadataValid: boolean;
  quoteValid: boolean;
  quoteAgeSeconds: number | null;
  spreadInPrice: number | null;
  spreadWithinPolicy: boolean | null;
  pipDefinition: "BROKER_DEFINED" | "NOT_CONFIGURED";
  limitations: string[];
}

export interface InstrumentSpecialistFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "INVALID_INSTRUMENT_SPECIFICATION"
    | "GOLD_SYMBOL_SPECIFICATION_MISMATCH"
    | "INVALID_FX_CURRENCY_PAIR"
    | "INVALID_QUOTE"
    | "QUOTE_SYMBOL_MISMATCH"
    | "INVALID_TIMESTAMP"
    | "STALE_QUOTE"
    | "SPREAD_EXCEEDS_POLICY"
    | "SOURCE_PROVENANCE_MISSING";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "instrument-specialist/0.1.0";

function emptyAssessment(input: InstrumentSpecialistInput): InstrumentSpecialistAssessment {
  return {
    symbol: input.specification.symbol,
    assetClass: input.specification.assetClass,
    metadataValid: false,
    quoteValid: false,
    quoteAgeSeconds: null,
    spreadInPrice: null,
    spreadWithinPolicy: null,
    pipDefinition: input.specification.pipSize === null ? "NOT_CONFIGURED" : "BROKER_DEFINED",
    limitations: [
      "Instrument metadata is supplied by the caller and is not independently certified against a broker contract specification.",
      "This module does not calculate position size, margin, pip value, profit, loss, or a trade signal.",
    ],
  };
}

function result(
  input: InstrumentSpecialistInput,
  findings: InstrumentSpecialistFinding[],
  assessment: InstrumentSpecialistAssessment,
  status: BrainSkillResult<InstrumentSpecialistFinding>["status"],
  readiness: BrainSkillResult<InstrumentSpecialistFinding>["evidenceReadiness"],
): BrainSkillResult<InstrumentSpecialistFinding> & { assessment: InstrumentSpecialistAssessment } {
  return {
    skillId: "instrument-specialist",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: assessment.spreadInPrice === null
      ? []
      : [`Observed bid/ask spread: ${assessment.spreadInPrice} price units.`],
    interpretations: assessment.spreadWithinPolicy === false
      ? ["The observed spread exceeds the explicitly configured policy limit."]
      : [],
    supportingEvidence: assessment.quoteValid
      ? ["Bid and ask are positive, ordered, symbol-matched and within the configured quote-age limit."]
      : [],
    contraryEvidence: findings.map((finding) => finding.message),
    uncertainties: [
      "Broker contract specifications, symbol suffixes, trading hours and execution conditions must be verified independently.",
      "A valid quote snapshot does not establish liquidity, fill quality or tradability.",
    ],
    sourceReferences: input.sourceReferences,
    limitations: assessment.limitations,
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

/**
 * Validates explicitly supplied Forex/Gold metadata and a quote snapshot.
 * No pip, tick, contract, lot or spread thresholds are inferred.
 */
export function assessInstrumentSpecialist(
  input: InstrumentSpecialistInput,
  policy?: InstrumentSpecialistPolicy,
): BrainSkillResult<InstrumentSpecialistFinding> & { assessment: InstrumentSpecialistAssessment } {
  const assessment = emptyAssessment(input);
  const findings: InstrumentSpecialistFinding[] = [];

  if (
    !policy ||
    !Number.isFinite(policy.maximumQuoteAgeSeconds) ||
    policy.maximumQuoteAgeSeconds < 0 ||
    !Number.isFinite(policy.maximumSpreadInPrice) ||
    policy.maximumSpreadInPrice < 0 ||
    typeof policy.requireSourceProvenance !== "boolean"
  ) {
    findings.push({
      code: policy ? "INVALID_POLICY" : "POLICY_MISSING",
      message: "An explicit quote-age and spread policy is required; no broker or instrument thresholds are guessed.",
    });
    return result(input, findings, assessment, "INCOMPLETE", "INCOMPLETE");
  }

  const spec = input.specification;
  const precisionScale = 10 ** spec.pricePrecision;
  const validSpecification =
    Boolean(spec.symbol) &&
    (spec.assetClass === "FOREX" || spec.assetClass === "GOLD") &&
    Number.isInteger(spec.pricePrecision) &&
    spec.pricePrecision >= 0 &&
    spec.pricePrecision <= 12 &&
    Number.isFinite(spec.tickSize) &&
    spec.tickSize > 0 &&
    Number.isInteger(spec.tickSize * precisionScale) &&
    Number.isFinite(spec.contractSize) &&
    spec.contractSize > 0 &&
    Number.isFinite(spec.minimumLot) &&
    spec.minimumLot > 0 &&
    Number.isFinite(spec.lotStep) &&
    spec.lotStep > 0 &&
    Number.isInteger(spec.minimumLot / spec.lotStep);

  if (!validSpecification) {
    findings.push({
      code: "INVALID_INSTRUMENT_SPECIFICATION",
      message: "Instrument specification has missing or inconsistent precision, tick, contract or lot metadata.",
    });
    return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }

  if (spec.assetClass === "FOREX") {
    const validCurrencies =
      /^[A-Z]{3}$/.test(spec.baseAsset) &&
      /^[A-Z]{3}$/.test(spec.quoteAsset) &&
      spec.baseAsset !== spec.quoteAsset &&
      Number.isFinite(spec.pipSize) &&
      (spec.pipSize as number) > 0 &&
      Number.isInteger((spec.pipSize as number) / spec.tickSize);
    if (!validCurrencies) {
      findings.push({
        code: "INVALID_FX_CURRENCY_PAIR",
        message: "Forex requires distinct three-letter currency codes and an explicit broker-defined pip size aligned to tick size.",
      });
      return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
    }
  } else if (spec.baseAsset !== "XAU" || spec.quoteAsset !== "USD" || spec.pipSize !== null && (!Number.isFinite(spec.pipSize) || spec.pipSize <= 0)) {
    findings.push({
      code: "GOLD_SYMBOL_SPECIFICATION_MISMATCH",
      message: "Gold metadata must explicitly describe XAU quoted in USD; any configured pip size must be positive and broker-defined.",
    });
    return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }

  assessment.metadataValid = true;

  if (policy.requireSourceProvenance && input.sourceReferences.length === 0) {
    findings.push({
      code: "SOURCE_PROVENANCE_MISSING",
      message: "Quote source provenance is required by policy.",
    });
  }

  if (input.quote.symbol !== spec.symbol) {
    findings.push({
      code: "QUOTE_SYMBOL_MISMATCH",
      message: "Quote symbol does not match the supplied instrument specification.",
    });
    return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }

  const asOf = Date.parse(input.asOf);
  const observedAt = Date.parse(input.quote.observedAt);
  if (!Number.isFinite(asOf) || !Number.isFinite(observedAt) || observedAt > asOf) {
    findings.push({
      code: "INVALID_TIMESTAMP",
      message: "Evaluation and quote timestamps must be valid, and the quote cannot be from the future.",
    });
    return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }

  const quoteAgeSeconds = (asOf - observedAt) / 1000;
  const spread = input.quote.ask - input.quote.bid;
  if (
    !Number.isFinite(input.quote.bid) ||
    !Number.isFinite(input.quote.ask) ||
    input.quote.bid <= 0 ||
    input.quote.ask <= 0 ||
    input.quote.ask < input.quote.bid ||
    !Number.isInteger(input.quote.bid * precisionScale) ||
    !Number.isInteger(input.quote.ask * precisionScale) ||
    !Number.isInteger(input.quote.bid / spec.tickSize) ||
    !Number.isInteger(input.quote.ask / spec.tickSize)
  ) {
    findings.push({
      code: "INVALID_QUOTE",
      message: "Bid and ask must be positive, correctly ordered and aligned to the declared price precision and tick size.",
    });
    return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }

  assessment.quoteValid = true;
  assessment.quoteAgeSeconds = quoteAgeSeconds;
  assessment.spreadInPrice = spread;
  assessment.spreadWithinPolicy = spread <= policy.maximumSpreadInPrice;

  if (quoteAgeSeconds > policy.maximumQuoteAgeSeconds) {
    findings.push({
      code: "STALE_QUOTE",
      message: `Quote age is ${quoteAgeSeconds} seconds; policy allows ${policy.maximumQuoteAgeSeconds}.`,
    });
  }
  if (!assessment.spreadWithinPolicy) {
    findings.push({
      code: "SPREAD_EXCEEDS_POLICY",
      message: `Spread is ${spread} price units; policy allows ${policy.maximumSpreadInPrice}.`,
    });
  }

  if (findings.length > 0) {
    const stale = findings.some((finding) => finding.code === "STALE_QUOTE");
    return result(input, findings, assessment, "COMPLETE", stale ? "STALE" : "DEGRADED");
  }

  return result(input, [], assessment, "COMPLETE", "READY");
}
