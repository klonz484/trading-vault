/* global require */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { buildBrainExecutionPlan } = require("../src/lib/trading-brain/execution-plan.ts");

function definition(id, dependencies = [], status = "TESTED") {
  return { id, name: id, group: "CORE_ANALYSIS", purpose: id, requiredEvidence: [], outputs: [], dependencies, safetyRules: [], status, version: "1.0.0" };
}

function snapshot(skillId, status = "ENABLED", mayInfluenceCollaborativeDecision = false) {
  return { skillId, status, version: "1.0.0", mayInfluenceCollaborativeDecision };
}

test("planner resolves dependencies before selected skills without auto-enabling them", () => {
  const result = buildBrainExecutionPlan({
    selectedSkillIds: ["risk-planning"],
    registry: [
      definition("evidence-quality"),
      definition("instrument-specialist", ["evidence-quality"]),
      definition("risk-planning", ["instrument-specialist"]),
    ],
    lifecycle: [
      snapshot("evidence-quality"),
      snapshot("instrument-specialist"),
      snapshot("risk-planning"),
    ],
  });

  assert.equal(result.status, "READY");
  assert.deepEqual(result.orderedSkillIds, ["evidence-quality", "instrument-specialist", "risk-planning"]);
  assert.equal(result.entries[0].includedAs, "DEPENDENCY");
  assert.equal(result.entries[2].includedAs, "SELECTED");
  assert.equal(result.entries.every((entry) => !entry.mayInfluenceCollaborativeDecision), true);
});

test("planner blocks untested skills and their dependents", () => {
  const result = buildBrainExecutionPlan({
    selectedSkillIds: ["risk-planning"],
    registry: [
      definition("evidence-quality", [], "IN_DEVELOPMENT"),
      definition("risk-planning", ["evidence-quality"]),
    ],
    lifecycle: [],
  });

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.orderedSkillIds, []);
  assert.equal(result.entries.every((entry) => !entry.executable), true);
});

test("only explicitly enabled skills may influence collaboration", () => {
  const result = buildBrainExecutionPlan({
    selectedSkillIds: ["market-structure"],
    registry: [definition("market-structure")],
    lifecycle: [snapshot("market-structure", "ENABLED", true)],
  });

  assert.equal(result.status, "READY");
  assert.equal(result.entries[0].mayInfluenceCollaborativeDecision, true);
});

test("planner rejects missing selected skills and dependency cycles", () => {
  const missing = buildBrainExecutionPlan({
    selectedSkillIds: ["not-installed"],
    registry: [],
    lifecycle: [],
  });
  assert.equal(missing.status, "INVALID");

  const cyclic = buildBrainExecutionPlan({
    selectedSkillIds: ["a"],
    registry: [definition("a", ["b"]), definition("b", ["a"])],
    lifecycle: [snapshot("a"), snapshot("b")],
  });
  assert.equal(cyclic.status, "INVALID");
  assert.ok(cyclic.findings.some((finding) => finding.includes("cycle")));
});

test("planner requires an explicit selection", () => {
  const result = buildBrainExecutionPlan({ selectedSkillIds: [], registry: [], lifecycle: [] });
  assert.equal(result.status, "INVALID");
  assert.deepEqual(result.orderedSkillIds, []);
});
