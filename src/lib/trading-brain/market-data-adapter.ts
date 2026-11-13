import type { MarketDataSnapshot } from "../market-data/types";
import type { ReplayCandle } from "./replay";

export type BrainMarketDataGate =
  | "LIVE_ELIGIBLE"
  | "REPLAY_ONLY"
  | "BLOCKED";

export interface BrainMarketDataInput {
  contractVersion: "1.0.0";
  snapshotVersion: string;
  instrument: MarketDataSnapshot["instrument"];
  timeframe: MarketDataSnapshot["timeframe"];
  provider: MarketDataSnapshot["provider"];
  retrievedAt: string;
  sourceSymbol: string;
  sourceTimezone: string;
  entitlementStatus: MarketDataSnapshot["source"]["entitlementStatus"];
  licenceStatus: MarketDataSnapshot["source"]["licenceStatus"];
  readiness: MarketDataSnapshot["validation"]["status"];
  gate: BrainMarketDataGate;
  candles: ReplayCandle[];
  sourceReferences: string[];
  limitations: string[];
}

/**
 * Converts a validated Market Data Engine snapshot into the Brain's
 * closed-candle replay shape while preserving source provenance and gates.
 *
 * Non-READY or unverified provider data may be replayed for controlled
 * development/testing, but is never marked eligible for live Brain analysis.
 * Structurally invalid or empty snapshots are blocked entirely.
 */
export function adaptMarketDataSnapshotForBrain(
  snapshot: MarketDataSnapshot,
): BrainMarketDataInput {
  const limitations = [...snapshot.limitations];
  const validRetrievedAt = Number.isFinite(Date.parse(snapshot.retrievedAt));
  const validSnapshotVersion =
    typeof snapshot.snapshotVersion === "string" &&
    snapshot.snapshotVersion.trim().length > 0;
  const candles = snapshot.candles.map((candle) => ({
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    provisional: candle.provisional,
  }));

  if (!validRetrievedAt || !validSnapshotVersion || candles.length === 0) {
    return {
      contractVersion: "1.0.0",
      snapshotVersion: snapshot.snapshotVersion,
      instrument: snapshot.instrument,
      timeframe: snapshot.timeframe,
      provider: snapshot.provider,
      retrievedAt: snapshot.retrievedAt,
      sourceSymbol: snapshot.source.symbol,
      sourceTimezone: snapshot.source.sourceTimezone,
      entitlementStatus: snapshot.source.entitlementStatus,
      licenceStatus: snapshot.source.licenceStatus,
      readiness: snapshot.validation.status,
      gate: "BLOCKED",
      candles: [],
      sourceReferences: [],
      limitations: [
        ...limitations,
        "Snapshot is missing a valid retrieval timestamp, version, or eligible candles.",
      ],
    };
  }

  const liveReady =
    snapshot.validation.status === "READY" &&
    snapshot.source.entitlementStatus === "VERIFIED" &&
    snapshot.source.licenceStatus === "VERIFIED";

  if (!liveReady) {
    limitations.push(
      "Snapshot is available for controlled replay only; live Brain assessment is blocked until readiness, entitlement, and licence checks are VERIFIED.",
    );
  }

  return {
    contractVersion: "1.0.0",
    snapshotVersion: snapshot.snapshotVersion,
    instrument: snapshot.instrument,
    timeframe: snapshot.timeframe,
    provider: snapshot.provider,
    retrievedAt: snapshot.retrievedAt,
    sourceSymbol: snapshot.source.symbol,
    sourceTimezone: snapshot.source.sourceTimezone,
    entitlementStatus: snapshot.source.entitlementStatus,
    licenceStatus: snapshot.source.licenceStatus,
    readiness: snapshot.validation.status,
    gate: liveReady ? "LIVE_ELIGIBLE" : "REPLAY_ONLY",
    candles,
    sourceReferences: [
      `market-data:${snapshot.snapshotVersion}`,
    ],
    limitations,
  };
}
