export type SignalTrack = "CURRENT" | "SESSION";

export type SignalLifecycleStatus =
  | "PREPARING"
  | "MONITORING"
  | "ACTIVE"
  | "SUSPENDED"
  | "INVALIDATED"
  | "EXPIRED"
  | "CANCELLED";

export interface SignalLifecycleEvidence {
  evidenceReadiness: "READY" | "DEGRADED" | "STALE" | "INCOMPLETE" | "CONFLICTED" | "UNAVAILABLE";
  livePriceAvailable: boolean;
  livePriceFresh: boolean;
  closedCandleConfirmed: boolean;
  conflictsResolved: boolean;
  collaborativeDecisionFinal: boolean;
  riskApproved: boolean;
  triggerConfirmed: boolean;
  sessionWindowOpen: boolean;
}

export interface SignalLifecycleInput {
  track: SignalTrack;
  status: SignalLifecycleStatus;
  scenarioPrepared: boolean;
  now: string;
  expiresAt: string;
  invalidationConfirmed: boolean;
  evidence: SignalLifecycleEvidence;
}

export interface SignalLifecycleResult {
  status: SignalLifecycleStatus;
  changed: boolean;
  activationEligible: boolean;
  blockingReasons: string[];
}

/**
 * Deterministic lifecycle guard for Current Signals and Session Signals.
 *
 * This module never creates a trade setup or invents a price. It only governs
 * whether an already-prepared scenario may be monitored, activated, suspended,
 * or closed based on explicit evidence supplied by upstream systems.
 */
export function evaluateSignalLifecycle(
  input: SignalLifecycleInput,
): SignalLifecycleResult {
  const terminalStatuses: SignalLifecycleStatus[] = [
    "INVALIDATED",
    "EXPIRED",
    "CANCELLED",
  ];

  if (terminalStatuses.includes(input.status)) {
    return {
      status: input.status,
      changed: false,
      activationEligible: false,
      blockingReasons: ["This signal lifecycle is terminal and cannot be reactivated."],
    };
  }

  if (input.invalidationConfirmed) {
    return {
      status: "INVALIDATED",
      changed: input.status !== "INVALIDATED",
      activationEligible: false,
      blockingReasons: ["The scenario's explicit invalidation condition has been confirmed."],
    };
  }

  const now = Date.parse(input.now);
  const expiresAt = Date.parse(input.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(expiresAt)) {
    return {
      status: input.status,
      changed: false,
      activationEligible: false,
      blockingReasons: ["Valid ISO timestamps are required to evaluate signal expiry."],
    };
  }

  if (now >= expiresAt) {
    return {
      status: "EXPIRED",
      changed: input.status !== "EXPIRED",
      activationEligible: false,
      blockingReasons: ["The scenario validity window has ended."],
    };
  }

  if (!input.scenarioPrepared) {
    return {
      status: "PREPARING",
      changed: input.status !== "PREPARING",
      activationEligible: false,
      blockingReasons: ["The scenario is not fully prepared."],
    };
  }

  const blockingReasons: string[] = [];
  if (input.evidence.evidenceReadiness !== "READY") {
    blockingReasons.push(`Evidence readiness is ${input.evidence.evidenceReadiness}, not READY.`);
  }
  if (!input.evidence.livePriceAvailable) {
    blockingReasons.push("A validated live price is unavailable.");
  }
  if (!input.evidence.livePriceFresh) {
    blockingReasons.push("The live price is not confirmed fresh.");
  }
  if (!input.evidence.closedCandleConfirmed) {
    blockingReasons.push("Closed-candle confirmation is missing.");
  }
  if (!input.evidence.conflictsResolved) {
    blockingReasons.push("Material evidence conflicts remain unresolved.");
  }
  if (!input.evidence.collaborativeDecisionFinal) {
    blockingReasons.push("The collaborative Scanner–Brain decision is not final.");
  }
  if (!input.evidence.riskApproved) {
    blockingReasons.push("Risk and applicable account-rule checks have not passed.");
  }
  if (!input.evidence.triggerConfirmed) {
    blockingReasons.push("The scenario trigger has not been confirmed.");
  }
  if (input.track === "SESSION" && !input.evidence.sessionWindowOpen) {
    blockingReasons.push("The planned trading-session activation window is not open.");
  }

  const activationEligible = blockingReasons.length === 0;

  if (input.status === "PREPARING") {
    return {
      status: "MONITORING",
      changed: true,
      activationEligible: false,
      blockingReasons: ["Scenario prepared; monitoring must begin before activation.", ...blockingReasons],
    };
  }

  if (input.status === "ACTIVE" && !activationEligible) {
    return {
      status: "SUSPENDED",
      changed: true,
      activationEligible: false,
      blockingReasons: ["An active signal lost one or more required evidence gates.", ...blockingReasons],
    };
  }

  if (input.status === "MONITORING" || input.status === "SUSPENDED") {
    return {
      status: activationEligible ? "ACTIVE" : input.status,
      changed: activationEligible,
      activationEligible,
      blockingReasons,
    };
  }

  return {
    status: input.status,
    changed: false,
    activationEligible,
    blockingReasons,
  };
}
