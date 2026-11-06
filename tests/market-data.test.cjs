const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

// Load project TypeScript directly through the installed TypeScript compiler.
// This keeps the test suite dependency-free and uses Node's built-in test runner.
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

const { validateCandles, isCandleStructurallyValid } = require("../src/lib/market-data/quality.ts");
const { parseTwelveDataTimestamp, TwelveDataProvider } = require("../src/lib/market-data/providers/twelve-data.ts");
const { compareProviderSnapshots } = require("../src/lib/market-data/provider-conflicts.ts");
const { appendEvidenceCorrection, createEvidenceCorrection, replaySnapshotValidation } = require("../src/lib/market-data/evidence.ts");

function candle(overrides = {}) {
  return {
    instrument: "EURUSD",
    timeframe: "M1",
    timestamp: "2026-11-06T12:00:00.000Z",
    open: 1.1,
    high: 1.2,
    low: 1.0,
    close: 1.15,
    volume: 10,
    provider: "twelve_data",
    retrievedAt: "2026-11-06T12:02:00.000Z",
    sourceTimestamp: "2026-11-06 12:00:00",
    sourceTimezone: "UTC",
    provisional: false,
    ...overrides,
  };
}

function snapshot(provider, close) {
  const item = candle({ provider, close });
  return {
    schemaVersion: "1.0.0",
    validatorVersion: "1.0.0",
    snapshotVersion: `test:${provider}`,
    instrument: "EURUSD",
    timeframe: "M1",
    provider,
    retrievedAt: "2026-11-06T12:02:00.000Z",
    source: {
      symbol: "EUR/USD",
      endpoint: "/test",
      attribution: provider,
      sourceTimezone: "UTC",
      entitlementStatus: "UNVERIFIED",
      licenceStatus: "UNVERIFIED",
    },
    candles: [item],
    rawCandles: [item],
    validation: {},
    limitations: [],
  };
}

test("parses offset-free provider timestamps as UTC, independent of host locale", () => {
  assert.equal(
    parseTwelveDataTimestamp("2026-11-06 12:30:00"),
    "2026-11-06T12:30:00.000Z",
  );
});

test("parses date-only daily candles as UTC midnight", () => {
  assert.equal(
    parseTwelveDataTimestamp("2026-11-06"),
    "2026-11-06T00:00:00.000Z",
  );
});

test("normalizes explicit timezone offsets to UTC", () => {
  assert.equal(
    parseTwelveDataTimestamp("2026-11-06T14:30:00+02:00"),
    "2026-11-06T12:30:00.000Z",
  );
});

test("rejects malformed and impossible provider timestamps", () => {
  assert.throws(() => parseTwelveDataTimestamp("not-a-date"));
  assert.throws(() => parseTwelveDataTimestamp("2026-02-30 12:00:00"));
});

test("accepts structurally valid OHLC and non-negative volume", () => {
  assert.equal(isCandleStructurallyValid(candle()), true);
  assert.equal(isCandleStructurallyValid(candle({ volume: -1 })), false);
  assert.equal(isCandleStructurallyValid(candle({ open: 2 })), false);
  assert.equal(isCandleStructurallyValid(candle({ timestamp: "not-a-date" })), false);
});

test("flags future-dated candles and prevents READY status", () => {
  const future = candle({ timestamp: "2026-11-06T12:02:01.000Z" });
  const result = validateCandles([future], {
    now: new Date("2026-11-06T12:02:00.000Z"),
    maxAgeSeconds: 600,
  });
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.futureTimestamps.length, 1);
  assert.equal(result.eligibleCandleCount, 0);
});

test("detects duplicate and out-of-order timestamps", () => {
  const first = candle({ timestamp: "2026-11-06T12:00:00.000Z" });
  const second = candle({ timestamp: "2026-11-06T12:01:00.000Z" });
  const third = candle({ timestamp: "2026-11-06T12:02:00.000Z" });
  const result = validateCandles([second, first, first, third], {
    now: new Date("2026-11-06T12:02:00.000Z"),
    maxAgeSeconds: 600,
  });
  assert.equal(result.duplicateTimestamps.length, 1);
  assert.equal(result.outOfOrderTimestamps.length, 1);
  assert.equal(result.status, "INCOMPLETE");
});


test("accepts a consistently descending provider response order", () => {
  const newest = candle({ timestamp: "2026-11-06T12:02:00.000Z" });
  const older = candle({ timestamp: "2026-11-06T12:01:00.000Z" });
  const result = validateCandles([newest, older], {
    now: new Date("2026-11-06T12:03:00.000Z"),
    maxAgeSeconds: 600,
  });
  assert.equal(result.outOfOrderTimestamps.length, 0);
  assert.equal(result.status, "READY");
});

test("reports interval gaps without assuming a market-session calendar", () => {
  const first = candle({ timestamp: "2026-11-06T12:00:00.000Z" });
  const second = candle({ timestamp: "2026-11-06T12:05:00.000Z" });
  const result = validateCandles([first, second], {
    now: new Date("2026-11-06T12:06:00.000Z"),
    maxAgeSeconds: 600,
  });
  assert.equal(result.missingIntervals.length, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(result.status, "READY");
});

test("requires a calibrated positive freshness threshold", () => {
  const result = validateCandles([candle()], {
    now: new Date("2026-11-06T12:02:00.000Z"),
    maxAgeSeconds: 0,
  });
  assert.equal(result.status, "INCOMPLETE");
  assert.ok(result.errors.some((entry) => entry.includes("Freshness threshold")));
});

test("provider conflicts preserve independent close observations", () => {
  const conflicts = compareProviderSnapshots(
    snapshot("twelve_data", 1.15),
    snapshot("alpha_vantage", 1.17),
    { maxAbsoluteCloseDifference: 0.01 },
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].status, "CONFLICTED");
  assert.equal(conflicts[0].closeA, 1.15);
  assert.equal(conflicts[0].closeB, 1.17);
});

test("provider comparison rejects missing or invalid calibration thresholds", () => {
  assert.throws(() => compareProviderSnapshots(
    snapshot("twelve_data", 1.15),
    snapshot("alpha_vantage", 1.17),
    { maxAbsoluteCloseDifference: 0 },
  ));
});

test("Twelve Data malformed JSON becomes a structured non-retryable error", async () => {
  const previousKey = process.env.TWELVE_DATA_API_KEY;
  const previousFetch = global.fetch;
  process.env.TWELVE_DATA_API_KEY = "unit-test-key";
  global.fetch = async () => new Response("{malformed", {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  try {
    const provider = new TwelveDataProvider();
    await assert.rejects(
      provider.getTimeSeries({
        id: "EURUSD",
        baseCurrency: "EUR",
        quoteCurrency: "USD",
        assetClass: "forex",
        twelveDataSymbol: "EUR/USD",
        alphaVantagePair: ["EUR", "USD"],
        initialPriority: true,
        providerEntitlementsRequireVerification: true,
      }, "M1"),
      (error) => error.code === "INVALID_RESPONSE" && error.retryable === false,
    );
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TWELVE_DATA_API_KEY;
    else process.env.TWELVE_DATA_API_KEY = previousKey;
  }
});


test("correction history is immutable and requires a continuous version chain", () => {
  const first = createEvidenceCorrection({
    correctionId: "corr-1",
    recordedAt: "2026-11-06T12:00:00.000Z",
    reason: "Provider corrected a historical candle.",
    supersedesVersion: "snapshot-1",
    replacementVersion: "snapshot-2",
  });
  const history = appendEvidenceCorrection([], first);
  assert.equal(history.length, 1);
  assert.throws(() => appendEvidenceCorrection(history, {
    correctionId: "corr-2",
    recordedAt: "2026-11-06T12:01:00.000Z",
    reason: "Discontinuous correction.",
    supersedesVersion: "snapshot-x",
    replacementVersion: "snapshot-3",
  }));
  assert.throws(() => appendEvidenceCorrection(history, first));
  assert.equal(Object.isFrozen(first), true);
});

test("snapshot validation replay uses the original clock and freshness threshold", () => {
  const raw = candle();
  const original = validateCandles([raw], {
    now: new Date("2026-11-06T12:02:00.000Z"),
    maxAgeSeconds: 600,
  });
  const source = snapshot("twelve_data", 1.15);
  source.rawCandles = [raw];
  source.validation = original;
  const replayed = replaySnapshotValidation(source);
  assert.deepEqual(replayed, original);
});

test("service withholds all analytical candles when series validation fails", async () => {
  const previousKey = process.env.TWELVE_DATA_API_KEY;
  const previousFetch = global.fetch;
  process.env.TWELVE_DATA_API_KEY = "unit-test-key";
  const sourceTime = new Date(Date.now() - 120_000).toISOString().slice(0, 19).replace("T", " ");
  global.fetch = async () => new Response(JSON.stringify({
    meta: { symbol: "EUR/USD", interval: "1min" },
    values: [{
      datetime: sourceTime,
      open: "1.2",
      high: "1.1",
      low: "1.0",
      close: "1.05",
      volume: "10",
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const { getTwelveDataSnapshot } = require("../src/lib/market-data/service.ts");
    const result = await getTwelveDataSnapshot("EURUSD", "M1", { maxAgeSeconds: 600 });
    assert.equal(result.rawCandles.length, 1);
    assert.equal(result.candles.length, 0);
    assert.equal(result.validation.status, "INCOMPLETE");
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TWELVE_DATA_API_KEY;
    else process.env.TWELVE_DATA_API_KEY = previousKey;
  }
});
