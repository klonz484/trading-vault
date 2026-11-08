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
  assessHierarchicalStructure,
  resolveStructureHierarchy,
} = require("../src/lib/trading-brain/skills/structure-hierarchy.ts");

const assessment = (bias, latestBreak = null) => ({
  bias,
  swings: [],
  latestBreak,
});

test("internal disagreement never overrides a bearish external structure", () => {
  const result = resolveStructureHierarchy(
    assessment("BULLISH"),
    assessment("BEARISH"),
  );
  assert.equal(result.internalBias, "BULLISH");
  assert.equal(result.externalBias, "BEARISH");
  assert.equal(result.conflict, true);
  assert.equal(result.lowerHierarchyChallengesExternal, true);
  assert.equal(result.reversalAuthority, "NONE");
  assert.ok(result.findings.some((item) => item.includes("do not average")));
});

test("internal direction with unclear external structure is only a challenge", () => {
  const result = resolveStructureHierarchy(
    assessment("BULLISH"),
    assessment("RANGE_OR_UNCLEAR"),
  );
  assert.equal(result.lowerHierarchyChallengesExternal, true);
  assert.equal(result.externalBias, "RANGE_OR_UNCLEAR");
  assert.equal(result.reversalAuthority, "NONE");
});

test("only an external reversal candidate receives external reversal authority", () => {
  const result = resolveStructureHierarchy(
    assessment("BULLISH"),
    assessment("BEARISH", {
      direction: "BULLISH",
      level: 1.1,
      candleClose: 1.101,
      candleTimestamp: "2026-11-08T10:00:00.000Z",
      context: "REVERSAL_CANDIDATE",
      confirmation: "CONFIRMED_CLOSED_CANDLE",
    }),
  );
  assert.equal(result.reversalAuthority, "EXTERNAL_ONLY");
  assert.ok(result.findings.some((item) => item.includes("full methodology gates")));
});

test("requires explicit calibration rather than guessing unresolved policy values", () => {
  const result = assessHierarchicalStructure({
    instrument: "EURUSD",
    timeframe: "H1",
    candles: [],
    evidenceGate: { status: "COMPLETE", evidenceReadiness: "READY" },
    sourceReferences: [],
  });
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.internalStatus, "INCOMPLETE");
  assert.equal(result.externalStatus, "INCOMPLETE");
  assert.ok(result.findings[0].includes("never guessed"));
});
