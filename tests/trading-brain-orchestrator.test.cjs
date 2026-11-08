/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const { runTradingBrainSkills } = require("../src/lib/trading-brain/orchestrator.ts");

function skill(id, dependencies = []) {
  return { id, name: id, group: "CORE_ANALYSIS", purpose: id, requiredEvidence: [], outputs: [], dependencies, safetyRules: [], status: "TESTED", version: "1.0.0" };
}
function lifecycle(skillId, status = "TESTED") {
  return { skillId, status, version: "1.0.0", mayInfluenceCollaborativeDecision: false };
}
function result(skillId, status = "COMPLETE", evidenceReadiness = "READY") {
  return { skillId, skillVersion: "1.0.0", status, evidenceReadiness, findings: [], observations: [], interpretations: [], supportingEvidence: [], contraryEvidence: [], uncertainties: [], sourceReferences: [], limitations: [], ruleSetVersion: "test/1.0.0" };
}

test("orchestrator executes dependencies before selected skill", async () => {
  const order = [];
  const output = await runTradingBrainSkills({
    selectedSkillIds: ["risk"],
    registry: [skill("quality"), skill("structure", ["quality"]), skill("risk", ["structure"])],
    lifecycle: [lifecycle("quality"), lifecycle("structure"), lifecycle("risk")],
    skillInput: { sample: true },
    executors: Object.fromEntries(["quality", "structure", "risk"].map((id) => [id, () => { order.push(id); return result(id); }])),
  });
  assert.equal(output.status, "COMPLETE");
  assert.deepEqual(order, ["quality", "structure", "risk"]);
  assert.deepEqual(output.executedSkillIds, order);
});

test("orchestrator blocks the entire run when skill lifecycle is not tested", async () => {
  const output = await runTradingBrainSkills({
    selectedSkillIds: ["risk"],
    registry: [skill("quality"), skill("risk", ["quality"])],
    lifecycle: [lifecycle("quality", "IN_DEVELOPMENT"), lifecycle("risk")],
    skillInput: null,
    executors: { quality: () => result("quality"), risk: () => result("risk") },
  });
  assert.equal(output.status, "BLOCKED");
  assert.deepEqual(output.executedSkillIds, []);
});

test("non-ready dependency result prevents downstream execution", async () => {
  let downstreamCalled = false;
  const output = await runTradingBrainSkills({
    selectedSkillIds: ["risk"],
    registry: [skill("quality"), skill("risk", ["quality"])],
    lifecycle: [lifecycle("quality"), lifecycle("risk")],
    skillInput: null,
    executors: {
      quality: () => result("quality", "INCOMPLETE", "INCOMPLETE"),
      risk: () => { downstreamCalled = true; return result("risk"); },
    },
  });
  assert.equal(output.status, "INCOMPLETE");
  assert.equal(downstreamCalled, false);
  assert.ok(output.skippedSkillIds.includes("risk"));
});

test("executor identity mismatch fails closed", async () => {
  const output = await runTradingBrainSkills({
    selectedSkillIds: ["quality"],
    registry: [skill("quality")],
    lifecycle: [lifecycle("quality")],
    skillInput: null,
    executors: { quality: () => result("wrong-id") },
  });
  assert.equal(output.status, "FAILED");
  assert.equal(output.results.length, 0);
  assert.ok(output.failures.some((failure) => failure.reason.includes("mismatched skill identity")));
});
