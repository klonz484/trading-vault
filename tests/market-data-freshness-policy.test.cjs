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

const { resolveFreshnessThresholdSeconds } = require("../src/lib/market-data/freshness-policy.ts");

test("freshness policy resolves an exact instrument and timeframe entry", () => {
  const policy = JSON.stringify({ EURUSD: { M15: 180 }, XAUUSD: { M15: 240 } });
  assert.equal(resolveFreshnessThresholdSeconds(policy, "EURUSD", "M15"), 180);
  assert.equal(resolveFreshnessThresholdSeconds(policy, "XAUUSD", "M15"), 240);
});

test("freshness policy does not reuse another instrument or timeframe threshold", () => {
  const policy = JSON.stringify({ EURUSD: { M15: 180 } });
  assert.equal(resolveFreshnessThresholdSeconds(policy, "XAUUSD", "M15"), undefined);
  assert.equal(resolveFreshnessThresholdSeconds(policy, "EURUSD", "H1"), undefined);
});

test("missing, malformed and non-positive thresholds remain unconfigured", () => {
  assert.equal(resolveFreshnessThresholdSeconds(undefined, "EURUSD", "M15"), undefined);
  assert.equal(resolveFreshnessThresholdSeconds("not-json", "EURUSD", "M15"), undefined);
  assert.equal(resolveFreshnessThresholdSeconds("[]", "EURUSD", "M15"), undefined);
  assert.equal(resolveFreshnessThresholdSeconds('{"EURUSD":{"M15":0}}', "EURUSD", "M15"), undefined);
  assert.equal(resolveFreshnessThresholdSeconds('{"EURUSD":{"M15":1.5}}', "EURUSD", "M15"), undefined);
  assert.equal(resolveFreshnessThresholdSeconds('{"EURUSD":{"M15":"180"}}', "EURUSD", "M15"), undefined);
});
