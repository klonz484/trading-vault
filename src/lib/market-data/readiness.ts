import type { CandleValidation, EvidenceVerification } from "./types";

export interface MarketDataReleaseEvidence {
  entitlementStatus: EvidenceVerification;
  licenceStatus: EvidenceVerification;
  validation: CandleValidation;
}

/**
 * Price data is displayable only when provider entitlement and licence are
 * explicitly verified and the candle series passes its configured readiness
 * checks. A valid HTTP response alone is never sufficient.
 */
export function canDisplayMarketPrices(evidence: MarketDataReleaseEvidence): boolean {
  return evidence.entitlementStatus === "VERIFIED" &&
    evidence.licenceStatus === "VERIFIED" &&
    evidence.validation.status === "READY" &&
    evidence.validation.freshnessThresholdSeconds !== null &&
    evidence.validation.eligibleCandleCount > 0;
}
