import type { MarketDataSnapshot } from "./types";
import { adaptMarketDataSnapshotForBrain } from "../trading-brain/market-data-adapter";
import {
  assessWithTradingBrain,
  createBrainAssessmentInputFromMarketData,
} from "../trading-brain/assessment";

/**
 * Carries a validated provider snapshot across the explicit Brain boundary.
 * The result is an evidence/readiness report only; no directional output,
 * signal activation, order, or execution action is possible here.
 */
export function createMarketDataBrainHandoff(snapshot: MarketDataSnapshot) {
  const marketData = adaptMarketDataSnapshotForBrain(snapshot);
  const assessment = assessWithTradingBrain(
    createBrainAssessmentInputFromMarketData({
      analysisId: snapshot.snapshotVersion,
      marketData,
    }),
  );

  return {
    marketDataGate: marketData.gate,
    status: assessment.status,
    decision: assessment.decision,
    uncertainties: [...assessment.uncertainties],
    sourceReferences: [...marketData.sourceReferences],
  };
}
