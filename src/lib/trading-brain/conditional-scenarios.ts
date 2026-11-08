import {
  evaluateSignalLifecycle,
  type SignalLifecycleEvidence,
  type SignalLifecycleResult,
  type SignalLifecycleStatus,
  type SignalTrack,
} from "./signal-lifecycle";

export interface ConditionalScenario {
  scenarioId: string;
  track: SignalTrack;
  instrument: string;
  timeframe: string;
  direction: "BUY" | "SELL";
  /** Human-readable rule plus the versioned rule identifier that produced it. */
  triggerRuleId: string;
  triggerDescription: string;
  invalidationRuleId: string;
  invalidationDescription: string;
  /** The strategy module must supply levels; this validator never derives them. */
  entryReference: number | null;
  invalidationLevel: number | null;
  createdAt: string;
  expiresAt: string;
  strategyId: string;
  strategyVersion: string;
  methodologyVersion: string;
  sourceReferences: string[];
}

export interface ScenarioValidation {
  prepared: boolean;
  findings: string[];
}

export interface ScenarioMonitorInput {
  scenario: ConditionalScenario;
  status: SignalLifecycleStatus;
  now: string;
  invalidationConfirmed: boolean;
  evidence: SignalLifecycleEvidence;
}

export interface ScenarioMonitorResult {
  scenarioId: string;
  track: SignalTrack;
  lifecycle: SignalLifecycleResult;
  findings: string[];
}

function validPositive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Validates a conditional scenario supplied by a strategy module.
 * It never creates levels, infers triggers, or promotes provisional evidence.
 */
export function validateConditionalScenario(
  scenario: ConditionalScenario,
): ScenarioValidation {
  const findings: string[] = [];
  if (!scenario.scenarioId.trim()) findings.push("Scenario identifier is required.");
  if (!scenario.instrument.trim()) findings.push("Instrument is required.");
  if (!scenario.timeframe.trim()) findings.push("Timeframe is required.");
  if (!scenario.triggerRuleId.trim() || !scenario.triggerDescription.trim()) {
    findings.push("A versioned trigger rule and description are required.");
  }
  if (!scenario.invalidationRuleId.trim() || !scenario.invalidationDescription.trim()) {
    findings.push("A versioned invalidation rule and description are required.");
  }
  if (!validPositive(scenario.entryReference)) {
    findings.push("An explicit positive entry reference supplied by the strategy is required.");
  }
  if (!validPositive(scenario.invalidationLevel)) {
    findings.push("An explicit positive invalidation level supplied by the strategy is required.");
  }
  if (!scenario.strategyId.trim() || !scenario.strategyVersion.trim()) {
    findings.push("Strategy identity and version are required.");
  }
  if (!scenario.methodologyVersion.trim()) findings.push("Methodology version is required.");
  if (scenario.sourceReferences.length === 0) findings.push("At least one source reference is required.");

  const createdAt = Date.parse(scenario.createdAt);
  const expiresAt = Date.parse(scenario.expiresAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt) {
    findings.push("Scenario creation and expiry must be valid timestamps with expiry after creation.");
  }

  if (scenario.direction === "BUY" && validPositive(scenario.entryReference) &&
      validPositive(scenario.invalidationLevel) && scenario.invalidationLevel >= scenario.entryReference) {
    findings.push("A BUY scenario invalidation level must be below its entry reference.");
  }
  if (scenario.direction === "SELL" && validPositive(scenario.entryReference) &&
      validPositive(scenario.invalidationLevel) && scenario.invalidationLevel <= scenario.entryReference) {
    findings.push("A SELL scenario invalidation level must be above its entry reference.");
  }

  return { prepared: findings.length === 0, findings };
}

/**
 * Applies the existing Current/Session lifecycle guard to a validated scenario.
 * Current and Session tracks remain independent; neither can bypass shared
 * evidence, collaboration, closed-candle, or risk gates.
 */
export function monitorConditionalScenario(
  input: ScenarioMonitorInput,
): ScenarioMonitorResult {
  const validation = validateConditionalScenario(input.scenario);
  if (!validation.prepared) {
    return {
      scenarioId: input.scenario.scenarioId,
      track: input.scenario.track,
      lifecycle: {
        status: "PREPARING",
        changed: input.status !== "PREPARING",
        activationEligible: false,
        blockingReasons: validation.findings,
      },
      findings: validation.findings,
    };
  }

  const lifecycle = evaluateSignalLifecycle({
    track: input.scenario.track,
    status: input.status,
    scenarioPrepared: true,
    now: input.now,
    expiresAt: input.scenario.expiresAt,
    invalidationConfirmed: input.invalidationConfirmed,
    evidence: input.evidence,
  });

  return {
    scenarioId: input.scenario.scenarioId,
    track: input.scenario.track,
    lifecycle,
    findings: [],
  };
}
