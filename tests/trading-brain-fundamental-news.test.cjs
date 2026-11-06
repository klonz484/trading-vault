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

const { assessFundamentalNews } = require("../src/lib/trading-brain/skills/fundamental-news.ts");

const source = {
  sourceId: "macro-feed-v1",
  providerId: "licensed-test-provider",
  observedAt: "2026-11-06T13:00:00.000Z",
  receivedAt: "2026-11-06T13:00:01.000Z",
  instrument: "EURUSD",
  timeframe: "calendar",
};

function item(overrides = {}) {
  return {
    id: "us-data-1",
    kind: "RELEASED_DATA",
    headline: "Example scheduled data release",
    summary: "Provider-supplied summary",
    publishedAt: "2026-11-06T13:00:00.000Z",
    currencies: ["USD"],
    impact: "UNSPECIFIED",
    actual: "100",
    forecast: "98",
    previous: "97",
    unit: "index points",
    sourceReferences: [source],
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    instrument: "EURUSD",
    instrumentCurrencies: ["EUR", "USD"],
    asOf: "2026-11-06T14:00:00.000Z",
    items: [item()],
    sourceReferences: [source],
    ...overrides,
  };
}

const policy = {
  maximumPublicationAgeSeconds: 86_400,
  maximumFutureEventHorizonSeconds: 7 * 86_400,
  requireItemProvenance: true,
  requireInstrumentSourceIdentity: true,
};

test("requires explicit freshness and provenance policy", () => {
  const result = assessFundamentalNews(input());
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.findings[0].code, "POLICY_MISSING");
});

test("preserves sourced macro facts and filters by explicit instrument currencies", () => {
  const result = assessFundamentalNews(input({
    items: [
      item(),
      item({
        id: "unrelated-jpy",
        currencies: ["JPY"],
        headline: "Unrelated JPY item",
      }),
    ],
  }), policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.equal(result.assessment.itemCount, 1);
  assert.deepEqual(result.assessment.relevantItems[0].matchedCurrencies, ["USD"]);
  assert.equal(result.assessment.relevantItems[0].actual, "100");
  assert.equal(result.assessment.relevantItems[0].forecast, "98");
  assert.equal(result.assessment.relevantItems[0].previous, "97");
  assert.deepEqual(result.interpretations, []);
});

test("supports scheduled events, released data, central-bank communication and commentary", () => {
  const result = assessFundamentalNews(input({
    items: [
      item({ id: "event", kind: "SCHEDULED_EVENT", eventAt: "2026-11-06T15:00:00.000Z" }),
      item({ id: "release", kind: "RELEASED_DATA" }),
      item({ id: "central", kind: "CENTRAL_BANK_COMMUNICATION" }),
      item({ id: "commentary", kind: "MACRO_COMMENTARY" }),
    ],
  }), policy);
  assert.equal(result.assessment.scheduledEventCount, 1);
  assert.equal(result.assessment.releasedDataCount, 1);
  assert.equal(result.assessment.centralBankCommunicationCount, 1);
  assert.equal(result.assessment.macroCommentaryCount, 1);
});

test("requires event time for scheduled events and validates future horizon", () => {
  const missing = assessFundamentalNews(input({
    items: [item({ kind: "SCHEDULED_EVENT", eventAt: undefined })],
  }), policy);
  assert.ok(missing.findings.some((finding) => finding.code === "INVALID_EVENT_TIMESTAMP"));

  const outside = assessFundamentalNews(input({
    items: [item({ kind: "SCHEDULED_EVENT", eventAt: "2026-12-01T15:00:00.000Z" })],
  }), policy);
  assert.ok(outside.findings.some((finding) => finding.code === "EVENT_OUTSIDE_HORIZON"));
});

test("rejects missing provenance when item provenance is required", () => {
  const result = assessFundamentalNews(input({
    items: [item({ sourceReferences: [] })],
  }), policy);
  assert.equal(result.status, "REJECTED");
  assert.ok(result.findings.some((finding) => finding.code === "ITEM_PROVENANCE_MISSING"));
});

test("rejects mismatched source identity", () => {
  const result = assessFundamentalNews(input({
    items: [item({ sourceReferences: [{ ...source, instrument: "XAUUSD" }] })],
  }), policy);
  assert.equal(result.status, "REJECTED");
  assert.ok(result.findings.some((finding) => finding.code === "ITEM_SOURCE_IDENTITY_MISMATCH"));
});

test("rejects future, malformed and stale publication timestamps", () => {
  const future = assessFundamentalNews(input({
    items: [item({ publishedAt: "2026-11-06T15:00:00.000Z" })],
  }), policy);
  assert.ok(future.findings.some((finding) => finding.code === "PUBLICATION_IN_FUTURE"));

  const malformed = assessFundamentalNews(input({
    items: [item({ publishedAt: "2026-11-06T13:00:00" })],
  }), policy);
  assert.ok(malformed.findings.some((finding) => finding.code === "INVALID_PUBLICATION_TIMESTAMP"));

  const stale = assessFundamentalNews(input({
    items: [item({ publishedAt: "2026-11-01T13:00:00.000Z" })],
  }), policy);
  assert.ok(stale.findings.some((finding) => finding.code === "ITEM_STALE"));
});

test("requires explicit currency relevance and valid policy", () => {
  const noCurrency = assessFundamentalNews(input({ instrumentCurrencies: [] }), policy);
  assert.equal(noCurrency.findings[0].code, "INSTRUMENT_CURRENCIES_MISSING");

  const badPolicy = assessFundamentalNews(input(), {
    ...policy,
    maximumPublicationAgeSeconds: 0,
  });
  assert.equal(badPolicy.findings[0].code, "INVALID_POLICY");
});

test("rejects malformed item fields and missing top-level source provenance", () => {
  const malformed = assessFundamentalNews(input({
    items: [item({ impact: "EXTREME", currencies: [] })],
  }), policy);
  assert.ok(malformed.findings.some((finding) => finding.code === "INVALID_ITEM"));

  const noSource = assessFundamentalNews(input({ sourceReferences: [] }), policy);
  assert.ok(noSource.findings.some((finding) => finding.code === "SOURCE_PROVENANCE_MISSING"));
});

test("does not treat an empty feed as proof of no macro or news risk", () => {
  const result = assessFundamentalNews(input({ items: [] }), policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.assessment.itemCount, 0);
  assert.ok(result.uncertainties.some((uncertainty) => uncertainty.includes("empty item list")));
});

test("validates source observed/received timestamps and item update times", () => {
  const badSource = assessFundamentalNews(input({
    sourceReferences: [{ ...source, receivedAt: "2026-11-06T14:30:00.000Z" }],
  }), policy);
  assert.ok(badSource.findings.some((finding) => finding.code === "SOURCE_TIMESTAMP_IN_FUTURE"));

  const invalidSource = assessFundamentalNews(input({
    sourceReferences: [{ ...source, observedAt: "not-a-date" }],
  }), policy);
  assert.ok(invalidSource.findings.some((finding) => finding.code === "SOURCE_TIMESTAMP_INVALID"));

  const futureUpdate = assessFundamentalNews(input({
    items: [item({ updatedAt: "2026-11-06T15:00:00.000Z" })],
  }), policy);
  assert.ok(futureUpdate.findings.some((finding) => finding.code === "PUBLICATION_IN_FUTURE"));
});

test("preserves impact labels and does not infer market direction or surprise", () => {
  const result = assessFundamentalNews(input({
    items: [item({ impact: "HIGH" })],
  }), policy);
  assert.equal(result.assessment.relevantItems[0].impact, "HIGH");
  assert.deepEqual(result.interpretations, []);
  assert.deepEqual(result.supportingEvidence, []);
  assert.deepEqual(result.contraryEvidence, []);
});
