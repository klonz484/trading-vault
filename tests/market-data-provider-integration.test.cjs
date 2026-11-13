/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.TWELVE_DATA_API_KEY = "test-provider-key";

const { getTwelveDataSnapshot } = require("../src/lib/market-data/service.ts");
const { createMarketDataBrainHandoff } = require("../src/lib/market-data/brain-bridge.ts");

function utcProviderTimestamp(value) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

test("mock provider response passes through normalization, validation and Brain handoff", async () => {
  const previousFetch = global.fetch;
  const now = Date.now();
  const lastClosedBar = Math.floor(now / 900_000) * 900_000 - 900_000;
  const sourceTimestamp = utcProviderTimestamp(new Date(lastClosedBar));
  let requestedUrl;

  global.fetch = async (input) => {
    requestedUrl = new URL(String(input));
    return new Response(JSON.stringify({
      meta: { symbol: "EUR/USD", interval: "15min" },
      values: [{
        datetime: sourceTimestamp,
        open: "1.15000",
        high: "1.16000",
        low: "1.14000",
        close: "1.15500",
        volume: "12",
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const snapshot = await getTwelveDataSnapshot("EURUSD", "M15", {
      outputsize: 1,
      maxAgeSeconds: 3600,
    });

    assert.equal(requestedUrl.hostname, "api.twelvedata.com");
    assert.equal(requestedUrl.searchParams.get("symbol"), "EUR/USD");
    assert.equal(requestedUrl.searchParams.get("interval"), "15min");
    assert.equal(requestedUrl.searchParams.get("timezone"), "UTC");
    assert.equal(snapshot.source.sourceTimezone, "UTC");
    assert.equal(snapshot.candles.length, 1);
    assert.equal(snapshot.candles[0].sourceTimezone, "UTC");
    assert.equal(snapshot.validation.status, "READY");

    const handoff = createMarketDataBrainHandoff({
      ...snapshot,
      source: {
        ...snapshot.source,
        entitlementStatus: "VERIFIED",
        licenceStatus: "VERIFIED",
      },
    });

    assert.equal(handoff.marketDataGate, "LIVE_ELIGIBLE");
    assert.equal(handoff.status, "INCOMPLETE");
    assert.equal(handoff.decision, "INSUFFICIENT_EVIDENCE");
  } finally {
    global.fetch = previousFetch;
  }
});
