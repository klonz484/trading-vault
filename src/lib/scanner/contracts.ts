/**
 * Trading Vault Scanner -> Brain contract.
 * Scanner observations are context only; they are never trade recommendations.
 */
export const SCANNER_SCHEMA_VERSION = "1.0.0" as const;
export const BRAIN_REQUEST_SCHEMA_VERSION = "1.0.0" as const;
export const BRAIN_ASSESSMENT_SCHEMA_VERSION = "1.0.0" as const;

export type ObservationSource = "screenshot_ocr" | "chart_visual" | "user_input" | "derived";
export type ObservationStatus = "observed" | "uncertain" | "unavailable";
export type DecisionState =
  | "CONFIRMED_SIGNAL"
  | "CONDITIONAL_SIGNAL"
  | "WATCHLIST_NO_TRADE"
  | "NEEDS_MANUAL_REVIEW"
  | "REJECTED";

export type FieldObservation<T> = {
  value: T | null;
  confidence: number;
  source: ObservationSource | "unavailable";
  status: ObservationStatus;
};

export type ChartObservation = {
  schemaVersion: typeof SCANNER_SCHEMA_VERSION;
  scanId: string;
  receivedAtUtc: string;
  image: { sha256: string; mimeType: "image/png" | "image/jpeg" | "image/webp"; byteLength: number };
  screenType: FieldObservation<"MT5_MOBILE" | "MT5_DESKTOP" | "TRADINGVIEW" | "QUOTES_LIST" | "ORDER_TICKET" | "SIGNAL_CARD" | "UNKNOWN">;
  timestamps: {
    deviceTime: FieldObservation<string>;
    chartOrBrokerTime: FieldObservation<string>;
    lastCandleTime: FieldObservation<string>;
    receiptTimeUtc: string;
    timezoneOrBrokerOffset: FieldObservation<string>;
  };
  instrument: FieldObservation<string>;
  timeframe: FieldObservation<string>;
  bid: FieldObservation<number>;
  ask: FieldObservation<number>;
  spread: FieldObservation<number>;
  marketStatus: FieldObservation<"OPEN" | "CLOSED">;
  marketLocation: {
    description: FieldObservation<string>;
    visibleLevels: Array<{ label: string; price: number | null; confidence: number }>;
    visibleFeatures: string[];
  };
  userContext: { instrument: string; timeframe: string; notes: string };
  quality: { rating: "CLEAR" | "PARTIAL" | "POOR"; warnings: string[] };
  packetStatus: "COMPLETE" | "INCOMPLETE";
  missingCriticalFields: string[];
  contextOnlyNotSignal: true;
};

export type BrainRequest = {
  schemaVersion: typeof BRAIN_REQUEST_SCHEMA_VERSION;
  requestId: string;
  createdAtUtc: string;
  observation: ChartObservation;
  liveDataRequest: {
    primarySource: "MT5_READ_ONLY";
    requestedInstrument: string | null;
    requestedTimeframe: string | null;
    requiredHigherTimeframes: string[];
    requireFreshTick: true;
    requireCandleHistory: true;
  };
};

export type BrainAssessment = {
  schemaVersion: typeof BRAIN_ASSESSMENT_SCHEMA_VERSION;
  assessmentId: string;
  scanId: string;
  generatedAtUtc: string;
  expiresAtUtc: string | null;
  state: DecisionState;
  dataConfidence: number;
  analyticalConfidence: number | null;
  liveData: {
    status: "VERIFIED" | "PARTIAL" | "UNAVAILABLE" | "MISMATCH";
    provider: string | null;
    broker: string | null;
    symbol: string | null;
    timeframe: string | null;
    tickTimeUtc: string | null;
    warnings: string[];
  };
  candidates: Array<{
    direction: "BUY" | "SELL";
    entryType: "MARKET" | "PENDING";
    entryLow: number | null;
    entryHigh: number | null;
    stopLoss: number | null;
    targets: number[];
    rationale: string[];
    invalidation: string;
    score: number;
  }>;
  riskGates: Array<{ gate: string; status: "PASS" | "FAIL" | "WARN" | "NOT_CHECKED"; reason: string }>;
  explanation: string[];
  noTradeReasons: string[];
  auditRef: string;
  manualExecutionOnly: true;
  orderSubmissionAvailable: false;
};

export function isConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function isFieldObservation(value: unknown): value is FieldObservation<unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const field = value as Record<string, unknown>;
  return (field.value === null || ["string", "number"].includes(typeof field.value)) &&
    isConfidence(field.confidence) &&
    ["screenshot_ocr", "chart_visual", "user_input", "derived", "unavailable"].includes(String(field.source)) &&
    ["observed", "uncertain", "unavailable"].includes(String(field.status)) &&
    (field.status !== "unavailable" || field.value === null);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function validateChartObservation(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const packet = asRecord(value);
  if (!packet) return { valid: false, errors: ["Packet must be an object."] };
  const image = asRecord(packet.image);
  const bid = asRecord(packet.bid);
  const ask = asRecord(packet.ask);
  const instrument = asRecord(packet.instrument);
  const timeframe = asRecord(packet.timeframe);
  if (packet.schemaVersion !== SCANNER_SCHEMA_VERSION) errors.push("Unsupported observation schema version.");
  if (typeof packet.scanId !== "string" || !packet.scanId) errors.push("scanId is required.");
  if (typeof packet.receivedAtUtc !== "string" || Number.isNaN(Date.parse(packet.receivedAtUtc))) errors.push("A valid UTC receipt timestamp is required.");
  if (!image || !/^[a-f0-9]{64}$/i.test(String(image.sha256))) errors.push("A SHA-256 image hash is required.");
  if (!image || !["image/png", "image/jpeg", "image/webp"].includes(String(image.mimeType))) errors.push("Unsupported image MIME type.");
  for (const key of ["screenType", "instrument", "timeframe", "bid", "ask", "spread", "marketStatus"]) {
    if (!isFieldObservation(packet[key])) errors.push(`${key} must be a valid field observation.`);
  }
  if (packet.contextOnlyNotSignal !== true) errors.push("Scanner output must be explicitly marked context-only.");
  if (!["COMPLETE", "INCOMPLETE"].includes(String(packet.packetStatus))) errors.push("Invalid packet status.");
  if (typeof bid?.value === "number" && typeof ask?.value === "number" && bid.value > ask.value) errors.push("Bid cannot exceed ask.");
  if (packet.packetStatus === "COMPLETE" && (instrument?.status !== "observed" || timeframe?.status !== "observed")) {
    errors.push("A complete packet requires observed instrument and timeframe.");
  }
  return { valid: errors.length === 0, errors };
}

/** Brain decisions fail closed unless live data is verified and the data confidence is adequate. */
export function validateBrainAssessment(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const assessment = asRecord(value);
  if (!assessment) return { valid: false, errors: ["Assessment must be an object."] };
  const liveData = asRecord(assessment.liveData);
  const dataConfidence = assessment.dataConfidence;
  const states = ["CONFIRMED_SIGNAL", "CONDITIONAL_SIGNAL", "WATCHLIST_NO_TRADE", "NEEDS_MANUAL_REVIEW", "REJECTED"];
  if (assessment.schemaVersion !== BRAIN_ASSESSMENT_SCHEMA_VERSION) errors.push("Unsupported assessment schema version.");
  if (!states.includes(String(assessment.state))) errors.push("Invalid decision state.");
  if (!isConfidence(dataConfidence)) errors.push("dataConfidence must be between 0 and 1.");
  if (assessment.analyticalConfidence !== null && !isConfidence(assessment.analyticalConfidence)) errors.push("analyticalConfidence must be null or between 0 and 1.");
  if (!liveData || !["VERIFIED", "PARTIAL", "UNAVAILABLE", "MISMATCH"].includes(String(liveData.status))) errors.push("Live-data status is required.");
  if (["CONFIRMED_SIGNAL", "CONDITIONAL_SIGNAL"].includes(String(assessment.state)) &&
      (liveData?.status !== "VERIFIED" || !isConfidence(dataConfidence) || dataConfidence < 0.8)) {
    errors.push("Signal states require verified live data and data confidence of at least 0.8.");
  }
  if (assessment.manualExecutionOnly !== true || assessment.orderSubmissionAvailable !== false) errors.push("Automated execution must remain unavailable.");
  if (!Array.isArray(assessment.riskGates) || !Array.isArray(assessment.candidates) || !Array.isArray(assessment.explanation)) errors.push("Assessment evidence arrays are required.");
  if (assessment.state === "WATCHLIST_NO_TRADE" && (!Array.isArray(assessment.noTradeReasons) || assessment.noTradeReasons.length === 0)) errors.push("No Trade requires explicit reasons.");
  return { valid: errors.length === 0, errors };
}
