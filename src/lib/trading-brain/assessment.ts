import type {
  EvidenceReadiness,
  IndependentAssessment,
} from "./contract";
import type {
  BrainMarketDataGate,
  BrainMarketDataInput,
} from "./market-data-adapter";

export interface BrainAssessmentInput {
  analysisId: string;
  instrument: string;
  timeframe: string;
  marketDataGate: BrainMarketDataGate;
  evidenceReadiness: EvidenceReadiness;
  sourceReferences: string[];
  limitations: string[];
  closedCandleEvidenceAvailable: boolean;
  higherTimeframeEvidenceAvailable: boolean;
  validatedMarketStructureAvailable: boolean;
}

/**
 * Creates a typed Brain input from the adapter output. Higher-timeframe and
 * market-structure availability must be supplied by their own validators;
 * they are never inferred from a single timeframe snapshot.
 */
export function createBrainAssessmentInputFromMarketData(input: {
  analysisId: string;
  marketData: BrainMarketDataInput;
  higherTimeframeEvidenceAvailable?: boolean;
  validatedMarketStructureAvailable?: boolean;
}): BrainAssessmentInput {
  return {
    analysisId: input.analysisId,
    instrument: input.marketData.instrument,
    timeframe: input.marketData.timeframe,
    marketDataGate: input.marketData.gate,
    evidenceReadiness: input.marketData.readiness,
    sourceReferences: [...input.marketData.sourceReferences],
    limitations: [...input.marketData.limitations],
    closedCandleEvidenceAvailable: input.marketData.candles.some(
      (candle) => candle.provisional === false,
    ),
    higherTimeframeEvidenceAvailable:
      input.higherTimeframeEvidenceAvailable ?? false,
    validatedMarketStructureAvailable:
      input.validatedMarketStructureAvailable ?? false,
  };
}

/**
 * Safe service boundary for the independent Trading Brain.
 *
 * This first implementation intentionally does not infer a market direction.
 * The approved methodology has not yet been translated into executable,
 * testable rules, and the Market Data Engine is not certified READY.
 */
export function assessWithTradingBrain(
  input: BrainAssessmentInput,
): IndependentAssessment {
  const missing: string[] = [];

  if (input.marketDataGate !== "LIVE_ELIGIBLE") {
    missing.push(
      "Market-data gate is " + input.marketDataGate + "; live Brain assessment is blocked.",
    );
  }
  if (!input.closedCandleEvidenceAvailable) {
    missing.push("Confirmed closed-candle evidence is not available.");
  }
  if (!input.higherTimeframeEvidenceAvailable) {
    missing.push("Validated higher-timeframe context is not available.");
  }
  if (!input.validatedMarketStructureAvailable) {
    missing.push("Validated market-structure evidence is not available.");
  }
  if (input.evidenceReadiness !== "READY") {
    missing.push("Market-data readiness is " + input.evidenceReadiness + ", not READY.");
  }

  missing.push(
    "The formal Trading Vault methodology has not yet been implemented as a verified rule set.",
  );

  return {
    system: "BRAIN",
    status: "INCOMPLETE",
    decision: "INSUFFICIENT_EVIDENCE",
    tradePlan: {
      orderType: "NONE",
      entryType: "none",
    },
    rationale:
      "The independent Trading Brain service boundary is active, but it is not authorised to produce a directional assessment until the methodology rules and evidence validators are implemented and tested.",
    observations: [],
    interpretations: [],
    supportingEvidence: [],
    contraryEvidence: [],
    uncertainties: missing,
    methodologyVersion: "brain-methodology-pending/0.1.0",
    modelProvenance: "deterministic-safe-stub",
  };
}
