import type { BrainSkillDefinition, BrainSkillStatus } from "./skills/registry";
import type { SkillLifecycleSnapshot } from "./skills/types";

export interface BrainExecutionPlanInput {
  /** Strategies selected by the user or a higher-level market-context selector. */
  selectedSkillIds: string[];
  registry: readonly BrainSkillDefinition[];
  lifecycle: readonly SkillLifecycleSnapshot[];
}

export interface BrainExecutionPlanEntry {
  skillId: string;
  order: number | null;
  status: BrainSkillStatus | "UNKNOWN";
  includedAs: "SELECTED" | "DEPENDENCY";
  executable: boolean;
  mayInfluenceCollaborativeDecision: boolean;
  blockedReasons: string[];
}

export interface BrainExecutionPlan {
  status: "READY" | "BLOCKED" | "INVALID";
  orderedSkillIds: string[];
  entries: BrainExecutionPlanEntry[];
  findings: string[];
  limitations: string[];
}

const READY_STATUSES = new Set<BrainSkillStatus>(["TESTED", "ENABLED"]);

/**
 * Resolves an explicit Brain skill selection into a deterministic dependency
 * order. It plans only: it does not execute skills, enable strategies, change
 * their lifecycle, or authorize a directional decision.
 *
 * A dependency must be TESTED or ENABLED before its dependent skill can run.
 * Only an ENABLED skill whose lifecycle snapshot explicitly permits influence
 * may contribute to the collaborative decision.
 */
export function buildBrainExecutionPlan(
  input: BrainExecutionPlanInput,
): BrainExecutionPlan {
  const findings: string[] = [];
  const definitions = new Map(input.registry.map((skill) => [skill.id, skill]));
  const lifecycle = new Map(input.lifecycle.map((item) => [item.skillId, item]));
  const selected = new Set(input.selectedSkillIds);
  const included = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];
  const invalid = new Set<string>();

  if (!Array.isArray(input.selectedSkillIds) || input.selectedSkillIds.length === 0) {
    return {
      status: "INVALID",
      orderedSkillIds: [],
      entries: [],
      findings: ["At least one explicitly selected Brain skill is required."],
      limitations: ["This planner does not select strategies from market conditions; it resolves a selection supplied by its caller."],
    };
  }

  for (const id of selected) {
    if (!definitions.has(id)) {
      findings.push(`Selected skill "${id}" is not present in the installed registry.`);
      invalid.add(id);
    }
  }

  const visit = (id: string): void => {
    if (visited.has(id) || invalid.has(id)) return;
    if (visiting.has(id)) {
      findings.push(`Dependency cycle detected at skill "${id}".`);
      invalid.add(id);
      return;
    }
    const definition = definitions.get(id);
    if (!definition) {
      findings.push(`Required dependency "${id}" is missing from the installed registry.`);
      invalid.add(id);
      return;
    }

    visiting.add(id);
    included.add(id);
    for (const dependency of definition.dependencies) {
      visit(dependency);
      if (invalid.has(dependency)) invalid.add(id);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(id);
  };

  for (const id of selected) {
    if (definitions.has(id)) visit(id);
  }

  const entries: BrainExecutionPlanEntry[] = ordered.map((id, index) => {
    const definition = definitions.get(id)!;
    const snapshot = lifecycle.get(id);
    const status = snapshot?.status ?? definition.status;
    const blockedReasons: string[] = [];

    if (!READY_STATUSES.has(status)) {
      blockedReasons.push(`Skill lifecycle is ${status}; TESTED or ENABLED is required.`);
    }
    for (const dependency of definition.dependencies) {
      const dependencyDefinition = definitions.get(dependency);
      const dependencySnapshot = lifecycle.get(dependency);
      const dependencyStatus = dependencySnapshot?.status ?? dependencyDefinition?.status;
      if (!dependencyStatus || !READY_STATUSES.has(dependencyStatus)) {
        blockedReasons.push(`Dependency "${dependency}" is not TESTED or ENABLED.`);
      }
    }

    const executable = blockedReasons.length === 0 && !invalid.has(id);
    const mayInfluenceCollaborativeDecision =
      executable &&
      status === "ENABLED" &&
      snapshot?.mayInfluenceCollaborativeDecision === true;

    return {
      skillId: id,
      order: executable ? index + 1 : null,
      status,
      includedAs: selected.has(id) ? "SELECTED" : "DEPENDENCY",
      executable,
      mayInfluenceCollaborativeDecision,
      blockedReasons,
    };
  });

  const hasInvalidSelection = invalid.size > 0 || findings.length > 0;
  const hasBlockedEntries = entries.some((entry) => !entry.executable);
  return {
    status: hasInvalidSelection ? "INVALID" : hasBlockedEntries ? "BLOCKED" : "READY",
    orderedSkillIds: entries.filter((entry) => entry.executable).map((entry) => entry.skillId),
    entries,
    findings,
    limitations: [
      "This module creates a dependency-resolved execution plan; it does not execute specialist skills.",
      "Market-condition strategy selection, evidence validation, scenario generation and signal activation remain separate responsibilities.",
      "TESTED is required for execution; only explicitly ENABLED skills may influence collaborative decisions.",
      "No strategy is automatically enabled and no BUY/SELL decision or broker action is produced.",
    ],
  };
}
