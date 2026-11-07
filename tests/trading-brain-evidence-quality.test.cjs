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

const { assessEvidenceQuality } = require("../src/lib/trading-brain/skills/evidence-quality.ts");

const asOf = "2026-11-06T12:00:00.000Z";
const input = (overrides = {}) => ({
  instrument: "EURUSD",
  timeframe: "H1",
  asOf,
  candles: [
    { timestamp: "2026-11-06T10:00:00.000Z", instrument: "EURUSD", timeframe: "H1", open: 1.1, high: 1.102, low: 1.099, close: 1.101, isClosed: true },
    { timestamp: "2026-11-06T11:00:00.000Z", instrument: "EURUSD", timeframe: "H1", open: 1.101, high: 1.103, low: 1.1, close: 1.102, isClosed: true },
  ],
  sourceReferences: [
    { sourceId: "snapshot-1", providerId: "test-provider", observedAt: "2026-11-06T11:00:00.000Z", receivedAt: "2026-11-06T11:00:01.000Z", instrument: "EURUSD", timeframe: "H1" },
  ],
  entitlementVerified: true,
  licenceVerified: true,
  providerAgreement: "SINGLE_SOURCE",
  ...overrides,
});
const policy = {
  minimumCandles: 2,
  expectedIntervalSeconds: 3600,
  maximumAgeSeconds: 7200,
  maximumMissingIntervals: 0,
  allowSingleSource: true,
};

test("does not guess evidence thresholds when policy is absent", () => {
  const result = assessEvidenceQuality(input());
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.evidenceReadiness, "INCOMPLETE");
  assert.equal(result.findings[0].code, "POLICY_MISSING");
});

test("returns READY only when the supplied policy and all evidence checks pass", () => {
  const result = assessEvidenceQuality(input(), policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.deepEqual(result.findings, []);
});

test("blocks provisional candles, unverified licence, and provider conflicts", () => {
  const data = input({
    candles: [
      ...input().candles.slice(0, 1),
      { ...input().candles[1], isClosed: false },
    ],
    licenceVerified: false,
    providerAgreement: "CONFLICTED",
  });
  const result = assessEvidenceQuality(data, policy);
  const codes = result.findings.map((finding) => finding.code);
  assert.equal(result.status, "INCOMPLETE");
  assert.ok(codes.includes("PROVISIONAL_CANDLE"));
  assert.ok(codes.includes("LICENCE_UNVERIFIED"));
  assert.ok(codes.includes("PROVIDER_CONFLICT"));
  assert.notEqual(result.evidenceReadiness, "READY");
});

test("detects stale snapshots and invalid OHLC", () => {
  const data = input({
    candles: [
      { ...input().candles[0], timestamp: "2026-11-06T08:00:00.000Z", high: 1.09 },
      { ...input().candles[1], timestamp: "2026-11-06T09:00:00.000Z" },
    ],
  });
  const result = assessEvidenceQuality(data, policy);
  const codes = result.findings.map((finding) => finding.code);
  assert.ok(codes.includes("INVALID_OHLC"));
  assert.ok(codes.includes("STALE_DATA"));
  assert.equal(result.evidenceReadiness, "STALE");
});
