/* global require */
const test = require("node:test");
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

const {
  TRADING_BRAIN_SKILLS,
  getBrainSkill,
  getBrainSkillsByGroup,
  getBrainSkillReadiness,
} = require("../src/lib/trading-brain/skills/registry.ts");

test("registry contains all 26 approved specialist skills with unique stable IDs", () => {
  assert.equal(TRADING_BRAIN_SKILLS.length, 26);
  const ids = TRADING_BRAIN_SKILLS.map((skill) => skill.id);
  assert.equal(new Set(ids).size, 26);
  for (const skill of TRADING_BRAIN_SKILLS) {
    assert.ok(skill.name.length > 0);
    assert.ok(skill.purpose.length > 0);
    assert.ok(skill.requiredEvidence.length > 0);
    assert.ok(skill.outputs.length > 0);
    assert.ok(skill.safetyRules.length > 0);
    assert.ok(["PLANNED", "IN_DEVELOPMENT"].includes(skill.status));
  }
});

test("registry exposes expected core skills and group filtering", () => {
  assert.equal(getBrainSkill("market-structure").name, "Market Structure Intelligence");
  assert.equal(getBrainSkill("confidence-calibration").name, "Confidence Calibration Intelligence");
  assert.equal(getBrainSkill("evidence-quality").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("market-structure").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("liquidity").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("institutional-concepts").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("multi-timeframe").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("instrument-specialist").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("risk-planning").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("session-timing").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("indicator").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("fundamental-news").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("pattern-recognition").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("scalp-cost-edge").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("scalp-microstructure").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("scalp-latency-execution").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("scalp-adaptive-strategy").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("scalp-behaviour-guardrails").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("scalp-micro-risk").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("scalp-ultra-short-signals").status, "IN_DEVELOPMENT");
  assert.equal(getBrainSkill("not-a-skill"), undefined);
  assert.equal(getBrainSkill("scalp-context").status, "IN_DEVELOPMENT");
  for (const id of []) {
    assert.equal(getBrainSkill(id).status, "PLANNED");
    assert.equal(getBrainSkill(id).group, "SCALPING");
  }
  assert.equal(getBrainSkillsByGroup("SCALPING").length, 8);
  assert.ok(getBrainSkillsByGroup("QUALITY").some((skill) => skill.id === "evidence-quality"));
  assert.ok(getBrainSkillsByGroup("LEARNING").some((skill) => skill.id === "backtesting"));
});

test("planned skills are never reported as implemented, tested, or enabled", () => {
  assert.deepEqual(getBrainSkillReadiness(), {
    total: 26,
    inDevelopment: 19,
    implemented: 0,
    tested: 0,
    enabled: 0,
    planned: 7,
  });
});

test("dependency references resolve to registered skills", () => {
  const ids = new Set(TRADING_BRAIN_SKILLS.map((skill) => skill.id));
  for (const skill of TRADING_BRAIN_SKILLS) {
    for (const dependency of skill.dependencies) {
      assert.ok(ids.has(dependency), `${skill.id} references unknown dependency ${dependency}`);
    }
  }
});
