import type { BrainSkillResult, SkillSourceReference } from "../types";

export interface BookLevel { price: number; size: number }
export interface BookSnapshot {
  sequence: number;
  timestamp: string;
  instrument: string;
  venueId: string;
  bids: BookLevel[];
  asks: BookLevel[];
}
export interface ScalpingMicrostructureInput {
  symbol: string;
  venueId: string;
  asOf: string;
  tickSize: number;
  sequenceComplete: boolean;
  snapshots: BookSnapshot[];
  sourceReferences: SkillSourceReference[];
  upstreamEvidenceReady: boolean;
}
export interface ScalpingMicrostructurePolicy {
  minimumSnapshots: number;
  requiredDepthLevels: number;
  maximumSnapshotAgeSeconds: number;
  maximumInterSnapshotGapSeconds: number;
  maximumSpreadTicks: number;
  requireSourceProvenance: boolean;
}
export interface ScalpingMicrostructureAssessment {
  snapshotCount: number;
  bestBid: number | null;
  bestAsk: number | null;
  spreadTicks: number | null;
  displayedBidDepth: number | null;
  displayedAskDepth: number | null;
  depthImbalance: number | null;
  latestSnapshotAgeSeconds: number | null;
  status: "OBSERVABLE" | "NOT_ASSESSABLE";
  limitations: string[];
}
export interface ScalpingMicrostructureFinding {
  code: "POLICY_MISSING" | "INVALID_POLICY" | "UPSTREAM_EVIDENCE_NOT_READY" | "SEQUENCE_INCOMPLETE" |
    "INSUFFICIENT_SNAPSHOTS" | "SOURCE_PROVENANCE_MISSING" | "INVALID_TIMESTAMP" | "INVALID_SEQUENCE" |
    "STALE_SNAPSHOT" | "EXCESSIVE_GAP" | "VENUE_OR_INSTRUMENT_MISMATCH" | "INSUFFICIENT_DEPTH" |
    "INVALID_BOOK" | "SPREAD_TOO_WIDE";
  message: string;
}

const VERSION = "0.1.0";
const RULES = "scalp-microstructure/0.1.0";

function makeResult(
  input: ScalpingMicrostructureInput,
  findings: ScalpingMicrostructureFinding[],
  assessment: ScalpingMicrostructureAssessment,
  status: BrainSkillResult<ScalpingMicrostructureFinding>["status"],
): BrainSkillResult<ScalpingMicrostructureFinding> & { assessment: ScalpingMicrostructureAssessment } {
  return {
    skillId: "scalp-microstructure",
    skillVersion: VERSION,
    status,
    evidenceReadiness: status === "COMPLETE" ? "READY" : "INCOMPLETE",
    findings,
    observations: assessment.status === "OBSERVABLE" ? [
      `Venue ${input.venueId}: spread ${assessment.spreadTicks} ticks across the best bid/ask.`,
      `Displayed depth across configured levels: bid ${assessment.displayedBidDepth}, ask ${assessment.displayedAskDepth}; depth imbalance ${assessment.depthImbalance}.`,
    ] : [],
    interpretations: [],
    supportingEvidence: assessment.status === "OBSERVABLE"
      ? ["Timestamped, venue-specific book snapshots passed the configured structural and freshness checks."]
      : [],
    contraryEvidence: findings.map((finding) => finding.message),
    uncertainties: [
      "This is one venue's displayed book, not a consolidated spot-Forex order book or a complete view of available liquidity.",
      "Displayed depth can change or cancel; it does not prove executable size, queue position, hidden liquidity or future fills.",
      "No spoofing, layering, iceberg, trader intent, aggressor flow, execution quality or trade direction is inferred.",
    ],
    sourceReferences: input.sourceReferences ?? [],
    limitations: assessment.limitations,
    ruleSetVersion: RULES,
    assessment,
  };
}

/** Validates and summarizes observable displayed depth from one identified venue; read-only. */
export function assessScalpingMicrostructure(
  input: ScalpingMicrostructureInput,
  policy?: ScalpingMicrostructurePolicy,
): BrainSkillResult<ScalpingMicrostructureFinding> & { assessment: ScalpingMicrostructureAssessment } {
  const assessment: ScalpingMicrostructureAssessment = {
    snapshotCount: input.snapshots.length,
    bestBid: null, bestAsk: null, spreadTicks: null,
    displayedBidDepth: null, displayedAskDepth: null, depthImbalance: null,
    latestSnapshotAgeSeconds: null, status: "NOT_ASSESSABLE",
    limitations: [
      "Metrics describe only supplied displayed depth from the named venue and sampling window.",
      "No claims are made about consolidated Forex liquidity, hidden orders, spoofing, layering, icebergs or queue position.",
      "No order placement, routing, strategy switching or execution action is available.",
    ],
  };
  const findings: ScalpingMicrostructureFinding[] = [];
  if (!policy) {
    findings.push({ code: "POLICY_MISSING", message: "An explicit book-quality policy is required." });
    return makeResult(input, findings, assessment, "INCOMPLETE");
  }
  if (!Number.isInteger(policy.minimumSnapshots) || policy.minimumSnapshots < 1 ||
      !Number.isInteger(policy.requiredDepthLevels) || policy.requiredDepthLevels < 1 ||
      !Number.isFinite(policy.maximumSnapshotAgeSeconds) || policy.maximumSnapshotAgeSeconds < 0 ||
      !Number.isFinite(policy.maximumInterSnapshotGapSeconds) || policy.maximumInterSnapshotGapSeconds <= 0 ||
      !Number.isFinite(policy.maximumSpreadTicks) || policy.maximumSpreadTicks <= 0 ||
      typeof policy.requireSourceProvenance !== "boolean") {
    findings.push({ code: "INVALID_POLICY", message: "Snapshot, depth, freshness, gap and spread thresholds must be explicit and valid." });
    return makeResult(input, findings, assessment, "REJECTED");
  }
  if (!input.upstreamEvidenceReady) {
    findings.push({ code: "UPSTREAM_EVIDENCE_NOT_READY", message: "The upstream evidence-quality gate must be READY before book metrics are assessed." });
  }
  if (!input.sequenceComplete) findings.push({ code: "SEQUENCE_INCOMPLETE", message: "The supplied book sequence is not confirmed complete." });
  if (!input.symbol || !input.venueId || !Number.isFinite(input.tickSize) || input.tickSize <= 0 ||
      !Number.isFinite(Date.parse(input.asOf))) {
    findings.push({ code: "INVALID_TIMESTAMP", message: "A symbol, venue, positive tick size and valid evaluation timestamp are required." });
  }
  if (input.snapshots.length < policy.minimumSnapshots) {
    findings.push({ code: "INSUFFICIENT_SNAPSHOTS", message: "The supplied snapshot count is below policy minimum." });
  }
  const validRefs = input.sourceReferences.filter((ref) =>
    ref.instrument === input.symbol && ref.timeframe === "orderbook" &&
    Number.isFinite(Date.parse(ref.observedAt)) && Number.isFinite(Date.parse(ref.receivedAt)) &&
    Date.parse(ref.observedAt) <= Date.parse(input.asOf) && Date.parse(ref.receivedAt) <= Date.parse(input.asOf)
  );
  if (policy.requireSourceProvenance && validRefs.length === 0) {
    findings.push({ code: "SOURCE_PROVENANCE_MISSING", message: "A timestamp-valid order-book source reference matching the instrument is required." });
  }
  let previousTime = -Infinity;
  let previousSequence = -Infinity;
  let latest: BookSnapshot | undefined;
  for (const snapshot of input.snapshots) {
    const time = Date.parse(snapshot.timestamp);
    if (!Number.isFinite(time) || time > Date.parse(input.asOf)) {
      findings.push({ code: "INVALID_TIMESTAMP", message: "A snapshot has an invalid or future timestamp." });
      continue;
    }
    if (snapshot.sequence <= previousSequence || time <= previousTime) {
      findings.push({ code: "INVALID_SEQUENCE", message: "Snapshot sequence numbers and timestamps must strictly increase." });
    }
    if (previousTime !== -Infinity && (time - previousTime) / 1000 > policy.maximumInterSnapshotGapSeconds) {
      findings.push({ code: "EXCESSIVE_GAP", message: "A gap between book snapshots exceeds policy." });
    }
    if (snapshot.instrument !== input.symbol || snapshot.venueId !== input.venueId) {
      findings.push({ code: "VENUE_OR_INSTRUMENT_MISMATCH", message: "A snapshot does not match the requested venue and instrument." });
    }
    if (snapshot.bids.length < policy.requiredDepthLevels || snapshot.asks.length < policy.requiredDepthLevels) {
      findings.push({ code: "INSUFFICIENT_DEPTH", message: "A snapshot has fewer bid or ask levels than required." });
    }
    const levelsValid = (levels: BookLevel[]) => levels.every((level, index) =>
      Number.isFinite(level.price) && level.price > 0 && Number.isFinite(level.size) && level.size > 0 &&
      (index === 0 || (levels === snapshot.bids ? levels[index - 1].price > level.price : levels[index - 1].price < level.price))
    );
    if (!levelsValid(snapshot.bids) || !levelsValid(snapshot.asks) ||
        !snapshot.bids.length || !snapshot.asks.length || snapshot.bids[0].price >= snapshot.asks[0].price) {
      findings.push({ code: "INVALID_BOOK", message: "Bid/ask levels must be positive, correctly ordered and non-crossed." });
    }
    previousTime = time;
    previousSequence = snapshot.sequence;
    latest = snapshot;
  }
  if (latest) {
    const age = (Date.parse(input.asOf) - Date.parse(latest.timestamp)) / 1000;
    assessment.latestSnapshotAgeSeconds = age;
    if (age < 0 || age > policy.maximumSnapshotAgeSeconds) {
      findings.push({ code: "STALE_SNAPSHOT", message: "The latest book snapshot is stale under policy." });
    }
    if (latest.bids.length >= policy.requiredDepthLevels && latest.asks.length >= policy.requiredDepthLevels &&
        latest.bids.length && latest.asks && latest.bids[0].price < latest.asks[0].price) {
      const bidDepth = latest.bids.slice(0, policy.requiredDepthLevels).reduce((sum, level) => sum + level.size, 0);
      const askDepth = latest.asks.slice(0, policy.requiredDepthLevels).reduce((sum, level) => sum + level.size, 0);
      const spread = (latest.asks[0].price - latest.bids[0].price) / input.tickSize;
      assessment.bestBid = latest.bids[0].price;
      assessment.bestAsk = latest.asks[0].price;
      assessment.spreadTicks = spread;
      assessment.displayedBidDepth = bidDepth;
      assessment.displayedAskDepth = askDepth;
      assessment.depthImbalance = (bidDepth - askDepth) / (bidDepth + askDepth);
      if (spread > policy.maximumSpreadTicks) findings.push({ code: "SPREAD_TOO_WIDE", message: "The observed spread exceeds the configured maximum." });
    }
  }
  if (findings.length) return makeResult(input, findings, assessment, "INCOMPLETE");
  assessment.status = "OBSERVABLE";
  return makeResult(input, [], assessment, "COMPLETE");
}
