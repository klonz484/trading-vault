const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadModule(relativePath) {
  const filename = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", javascript)(require, module, module.exports);
  return module.exports;
}

const { canDisplayMarketPrices } = loadModule("src/lib/market-data/readiness.ts");

function evidence(overrides = {}) {
  return {
    entitlementStatus: "VERIFIED",
    licenceStatus: "VERIFIED",
    validation: {
      status: "READY",
      freshnessThresholdSeconds: 120,
      eligibleCandleCount: 50,
    },
    ...overrides,
  };
}

test("allows prices only when entitlement, licence and data quality are verified", () => {
  assert.equal(canDisplayMarketPrices(evidence()), true);
});

test("withholds prices when provider entitlement is unverified", () => {
  assert.equal(canDisplayMarketPrices(evidence({ entitlementStatus: "UNVERIFIED" })), false);
});

test("withholds prices when licence is unverified", () => {
  assert.equal(canDisplayMarketPrices(evidence({ licenceStatus: "UNVERIFIED" })), false);
});

test("withholds prices when data is degraded, stale or conflicted", () => {
  for (const status of ["DEGRADED", "STALE", "CONFLICTED", "INCOMPLETE", "UNAVAILABLE"]) {
    assert.equal(canDisplayMarketPrices(evidence({
      validation: { status, freshnessThresholdSeconds: 120, eligibleCandleCount: 50 },
    })), false);
  }
});

test("withholds prices without a calibrated freshness threshold or eligible candles", () => {
  assert.equal(canDisplayMarketPrices(evidence({
    validation: { status: "READY", freshnessThresholdSeconds: null, eligibleCandleCount: 50 },
  })), false);
  assert.equal(canDisplayMarketPrices(evidence({
    validation: { status: "READY", freshnessThresholdSeconds: 120, eligibleCandleCount: 0 },
  })), false);
});
