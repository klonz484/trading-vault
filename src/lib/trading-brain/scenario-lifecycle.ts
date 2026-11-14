import type {
  EvidenceReference,
  ScenarioState,
  TradingScenario,
} from "./contracts";
import {
  canTransitionScenario,
  validateEvidence,
  validateScenario,
  type ValidationIssue,
} from "./validation";

export type ScenarioTransitionResult =
  | { ok: true; scenario: TradingScenario; issues: [] }
  | { ok: false; scenario: TradingScenario; issues: ValidationIssue[] };

export interface ScenarioTransitionOptions {
  evaluatedAt: string;
  confirmationEvidence?: EvidenceReference[];
}

/**
 * Applies a guarded state transition to a copy of a scenario.
 * This function is pure: it does not persist, publish, notify, or execute.
 */
export function transitionScenario(
  scenario: TradingScenario,
  nextState: ScenarioState,
  options: ScenarioTransitionOptions,
): ScenarioTransitionResult {
  const issues: ValidationIssue[] = [...validateScenario(scenario).issues];

  if (!Number.isFinite(Date.parse(options.evaluatedAt))) {
    issues.push({
      code: "SCENARIO_EVALUATION_TIME_INVALID",
      message: "A valid evaluatedAt timestamp is required for every transition.",
    });
  }

  if (!canTransitionScenario(scenario.state, nextState)) {
    issues.push({
      code: "SCENARIO_TRANSITION_NOT_ALLOWED",
      message: `Transition from "${scenario.state}" to "${nextState}" is not allowed.`,
    });
  }

  if (scenario.expiresAt && Date.parse(options.evaluatedAt) >= Date.parse(scenario.expiresAt)) {
    if (nextState !== "expired" && nextState !== "cancelled") {
      issues.push({
        code: "SCENARIO_EXPIRED",
        message: "An expired scenario cannot be advanced or confirmed.",
      });
    }
  }

  if (nextState === "confirmed") {
    const confirmationEvidence = options.confirmationEvidence ?? [];
    if (confirmationEvidence.length === 0) {
      issues.push({
        code: "SCENARIO_CONFIRMATION_EVIDENCE_REQUIRED",
        message: "Confirmation requires at least one valid, confirmed evidence record.",
      });
    }

    for (const evidence of confirmationEvidence) {
      issues.push(...validateEvidence(evidence));
      if (
        evidence.state !== "confirmed" ||
        evidence.quality !== "valid" ||
        evidence.instrument !== scenario.instrument ||
        evidence.timeframe !== scenario.timeframe
      ) {
        issues.push({
          code: "SCENARIO_CONFIRMATION_EVIDENCE_MISMATCH",
          message: "Confirmation evidence must be confirmed, valid, and match the scenario instrument and timeframe.",
          evidenceId: evidence.evidenceId,
        });
      }
    }
  }

  if (issues.length > 0) return { ok: false, scenario, issues };

  return {
    ok: true,
    scenario: { ...scenario, state: nextState },
    issues: [],
  };
}
