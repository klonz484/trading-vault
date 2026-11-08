import type { BrainSkillResult, SkillLifecycleSnapshot } from "./skills/types";
import { TRADING_BRAIN_SKILLS, type BrainSkillDefinition } from "./skills/registry";
import { buildBrainExecutionPlan } from "./execution-plan";

export type BrainSkillExecutor<TInput = unknown> = (
  input: TInput,
) => BrainSkillResult | Promise<BrainSkillResult>;

export interface TradingBrainRunInput<TInput = unknown> {
  selectedSkillIds: string[];
  lifecycle: readonly SkillLifecycleSnapshot[];
  skillInput: TInput;
  executors: Readonly<Record<string, BrainSkillExecutor<TInput> | undefined>>;
  registry?: readonly BrainSkillDefinition[];
}

export interface TradingBrainRunResult {
  status: "COMPLETE" | "BLOCKED" | "INCOMPLETE" | "FAILED";
  planStatus: "READY" | "BLOCKED" | "INVALID";
  executedSkillIds: string[];
  skippedSkillIds: string[];
  results: BrainSkillResult[];
  failures: Array<{ skillId: string; reason: string }>;
  limitations: string[];
}

/**
 * Runs only explicitly selected, TESTED/ENABLED skills in dependency order.
 * The caller supplies approved lifecycle snapshots and skill executors.
 * A failed or non-READY dependency prevents downstream execution.
 */
export async function runTradingBrainSkills<TInput>(
  input: TradingBrainRunInput<TInput>,
): Promise<TradingBrainRunResult> {
  const registry = input.registry ?? TRADING_BRAIN_SKILLS;
  const plan = buildBrainExecutionPlan({
    selectedSkillIds: input.selectedSkillIds,
    registry,
    lifecycle: input.lifecycle,
  });
  const results: BrainSkillResult[] = [];
  const executedSkillIds: string[] = [];
  const skippedSkillIds: string[] = [];
  const failures: TradingBrainRunResult["failures"] = [];
  const failed = new Set<string>();
  const definitions = new Map(registry.map((item) => [item.id, item]));

  if (plan.status !== "READY") {
    return {
      status: "BLOCKED",
      planStatus: plan.status,
      executedSkillIds,
      skippedSkillIds: plan.entries.map((entry) => entry.skillId),
      results,
      failures: plan.findings.map((reason) => ({ skillId: "planner", reason })),
      limitations: [
        ...plan.limitations,
        "No specialist skill was executed because the dependency plan did not pass.",
      ],
    };
  }

  for (const skillId of plan.orderedSkillIds) {
    const definition = definitions.get(skillId);
    if (!definition) {
      failed.add(skillId);
      failures.push({ skillId, reason: "Skill definition disappeared during orchestration." });
      skippedSkillIds.push(skillId);
      continue;
    }

    const failedDependency = definition.dependencies.find((dependency) => failed.has(dependency));
    if (failedDependency) {
      failed.add(skillId);
      skippedSkillIds.push(skillId);
      failures.push({
        skillId,
        reason: `Dependency "${failedDependency}" did not complete with READY evidence.`,
      });
      continue;
    }

    const executor = input.executors[skillId];
    if (!executor) {
      failed.add(skillId);
      skippedSkillIds.push(skillId);
      failures.push({ skillId, reason: "No executor was registered for this installed skill." });
      continue;
    }

    try {
      const result = await executor(input.skillInput);
      if (result.skillId !== skillId) {
        failed.add(skillId);
        failures.push({
          skillId,
          reason: `Executor returned mismatched skill identity "${result.skillId}".`,
        });
        continue;
      }
      results.push(result);
      if (result.status !== "COMPLETE" || result.evidenceReadiness !== "READY") {
        failed.add(skillId);
        failures.push({
          skillId,
          reason: `Skill returned ${result.status} with ${result.evidenceReadiness} evidence readiness.`,
        });
        continue;
      }
      executedSkillIds.push(skillId);
    } catch (error) {
      failed.add(skillId);
      failures.push({
        skillId,
        reason: error instanceof Error ? error.message : "Skill executor failed with an unknown error.",
      });
    }
  }

  const selectedIds = new Set(input.selectedSkillIds);
  const selectedResults = results.filter((result) => selectedIds.has(result.skillId));
  const selectedComplete = selectedResults.length === selectedIds.size &&
    selectedResults.every((result) => result.status === "COMPLETE" && result.evidenceReadiness === "READY");
  const status = failures.length > 0
    ? results.length > 0 ? "INCOMPLETE" : "FAILED"
    : selectedComplete ? "COMPLETE" : "INCOMPLETE";

  return {
    status,
    planStatus: plan.status,
    executedSkillIds,
    skippedSkillIds,
    results,
    failures,
    limitations: [
      "This orchestrator executes deterministic specialist modules only; it does not itself select a market strategy.",
      "A skill result is usable only when it returns COMPLETE with READY evidence.",
      "No Scanner assessment, BUY/SELL decision, signal activation, or broker action is created here.",
      "Lifecycle promotion to TESTED or ENABLED remains a separate controlled approval.",
    ],
  };
}
