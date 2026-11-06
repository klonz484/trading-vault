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

const { assessInstrumentSpecialist } = require("../src/lib/trading-brain/skills/instrument-specialist.ts");

const at = "2026-11-06T12:00:00.000Z";
const fxInput = (overrides = {}) => ({
  specification: {
    symbol: "EURUSD",
    assetClass: "FOREX",
    baseAsset: "EUR",
    quoteAsset: "USD",
    pricePrecision: 5,
    tickSize: 0.00001,
    pipSize: 0.0001,
    contractSize: 100000,
    minimumLot: 0.01,
    lotStep: 0.01,
  },
  quote: { symbol: "EURUSD", bid: 1.10000, ask: 1.10020, observedAt: at },
  asOf: at,
  sourceReferences: [{
    sourceId: "quote-1",
    providerId: "test-provider",
    observedAt: at,
    receivedAt: at,
    instrument: "EURUSD",
    timeframe: "TICK",
  }],
  ...overrides,
});
const policy = {
  maximumQuoteAgeSeconds: 30,
  maximumSpreadInPrice: 0.0003,
  requireSourceProvenance: true,
};

test("requires explicit quote freshness and spread policy", () => {
  const result = assessInstrumentSpecialist(fxInput());
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.findings[0].code, "POLICY_MISSING");
});

test("validates broker-supplied Forex metadata and a fresh quote", () => {
  const result = assessInstrumentSpecialist(fxInput(), policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.equal(result.assessment.metadataValid, true);
  assert.equal(result.assessment.quoteValid, true);
  assert.equal(result.assessment.spreadInPrice, 0.0002);
  assert.equal(result.assessment.pipDefinition, "BROKER_DEFINED");
});

test("validates Gold without assuming a pip size", () => {
  const result = assessInstrumentSpecialist(fxInput({
    specification: {
      symbol: "XAUUSD",
      assetClass: "GOLD",
      baseAsset: "XAU",
      quoteAsset: "USD",
      pricePrecision: 2,
      tickSize: 0.01,
      pipSize: null,
      contractSize: 100,
      minimumLot: 0.01,
      lotStep: 0.01,
    },
    quote: { symbol: "XAUUSD", bid: 2400.10, ask: 2400.30, observedAt: at },
  }), { ...policy, maximumSpreadInPrice: 0.5 });
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.equal(result.assessment.assetClass, "GOLD");
  assert.equal(result.assessment.pipDefinition, "NOT_CONFIGURED");
});

test("rejects Forex metadata without an explicit broker pip definition", () => {
  const result = assessInstrumentSpecialist(fxInput({
    specification: { ...fxInput().specification, pipSize: null },
  }), policy);
  assert.equal(result.status, "REJECTED");
  assert.equal(result.findings[0].code, "INVALID_FX_CURRENCY_PAIR");
});

test("rejects Gold metadata that does not describe XAU/USD", () => {
  const result = assessInstrumentSpecialist(fxInput({
    specification: {
      ...fxInput().specification,
      symbol: "XAUUSD",
      assetClass: "GOLD",
      baseAsset: "EUR",
      quoteAsset: "USD",
      pipSize: null,
    },
    quote: { symbol: "XAUUSD", bid: 2400.10, ask: 2400.20, observedAt: at },
  }), policy);
  assert.equal(result.status, "REJECTED");
  assert.equal(result.findings[0].code, "GOLD_SYMBOL_SPECIFICATION_MISMATCH");
});

test("rejects a quote whose symbol differs from the instrument specification", () => {
  const result = assessInstrumentSpecialist(fxInput({
    quote: { symbol: "GBPUSD", bid: 1.10000, ask: 1.10020, observedAt: at },
  }), policy);
  assert.equal(result.status, "REJECTED");
  assert.equal(result.findings[0].code, "QUOTE_SYMBOL_MISMATCH");
});

test("marks stale quotes and excessive spreads as degraded evidence", () => {
  const result = assessInstrumentSpecialist(fxInput({
    quote: { symbol: "EURUSD", bid: 1.10000, ask: 1.10100, observedAt: "2026-11-06T11:58:00.000Z" },
  }), policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "STALE");
  assert.ok(result.findings.some((finding) => finding.code === "STALE_QUOTE"));
  assert.ok(result.findings.some((finding) => finding.code === "SPREAD_EXCEEDS_POLICY"));
});

test("rejects quotes that do not align to the declared tick size", () => {
  const result = assessInstrumentSpecialist(fxInput({
    quote: { symbol: "EURUSD", bid: 1.100001, ask: 1.10020, observedAt: at },
  }), policy);
  assert.equal(result.status, "REJECTED");
  assert.ok(result.findings.some((finding) => finding.code === "INVALID_QUOTE"));
});
