/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(process.cwd(), "src/lib/scanner/contracts.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contractModule = { exports: {} };
vm.runInNewContext(compiled, { module: contractModule, exports: contractModule.exports });
const { validateChartObservation, validateBrainAssessment } = contractModule.exports;

function field(value, confidence = 0.95, status = value === null ? "unavailable" : "observed") {
  return { value, confidence, source: value === null ? "unavailable" : "screenshot_ocr", status };
}
function observationPacket() {
  return {
    schemaVersion: "1.0.0",
    scanId: "test-scan-001",
    receivedAtUtc: "2026-11-07T12:00:00.000Z",
    image: { sha256: "a".repeat(64), mimeType: "image/png", byteLength: 2048, storagePath: "owner/test-scan-001.png" },
    screenType: field("MT5_MOBILE"),
    timestamps: {
      deviceTime: field(null),
      chartOrBrokerTime: field("2026.11.07 12:00"),
      lastCandleTime: field("2026.11.07 11:00"),
      receiptTimeUtc: "2026-11-07T12:00:00.000Z",
      timezoneOrBrokerOffset: field(null),
    },
    instrument: field("EURUSD"),
    timeframe: field("H1"),
    bid: field(1.101),
    ask: field(1.102),
    spread: field(0.001),
    marketStatus: field(null),
    marketLocation: { description: field("Candles and two horizontal lines are visible."), visibleLevels: [], visibleFeatures: ["candles visible"] },
    userContext: { instrument: "EURUSD", timeframe: "H1", notes: "" },
    quality: { rating: "CLEAR", warnings: [] },
    packetStatus: "COMPLETE",
    missingCriticalFields: [],
    contextOnlyNotSignal: true,
  };
}
function brainAssessment() {
  return {
    schemaVersion: "1.0.0",
    assessmentId: "assessment-001",
    scanId: "test-scan-001",
    generatedAtUtc: "2026-11-07T12:01:00.000Z",
    expiresAtUtc: "2026-11-07T12:15:00.000Z",
    state: "CONFIRMED_SIGNAL",
    dataConfidence: 0.92,
    analyticalConfidence: 0.78,
    liveData: { status: "VERIFIED", provider: "MT5", broker: "Test broker", symbol: "EURUSD", timeframe: "H1", tickTimeUtc: "2026-11-07T12:00:59.000Z", warnings: [] },
    candidates: [{ direction: "BUY", entryType: "PENDING", entryLow: 1.1, entryHigh: 1.101, stopLoss: 1.095, targets: [1.11], rationale: ["example evidence"], invalidation: "H1 close below structural low", score: 0.82 }],
    riskGates: [{ gate: "spread", status: "PASS", reason: "Within configured limit" }],
    explanation: ["Illustrative test assessment only."],
    noTradeReasons: [],
    auditRef: "audit-001",
    manualExecutionOnly: true,
    orderSubmissionAvailable: false,
  };
}

test("runtime validator accepts a complete, context-only observation packet", () => {
  assert.deepEqual(validateChartObservation(observationPacket()).valid, true);
});

test("runtime validator rejects a complete packet with uncertain critical bid data", () => {
  const packet = observationPacket();
  packet.bid = field(1.101, 0.55, "uncertain");
  assert.equal(validateChartObservation(packet).valid, false);
});

test("runtime validator rejects bid values above ask values", () => {
  const packet = observationPacket();
  packet.bid = field(1.103);
  assert.equal(validateChartObservation(packet).valid, false);
});

test("runtime validator rejects observation packets not marked context-only", () => {
  const packet = observationPacket();
  packet.contextOnlyNotSignal = false;
  assert.equal(validateChartObservation(packet).valid, false);
});

test("runtime Brain validator accepts verified live data with manual-only execution", () => {
  assert.equal(validateBrainAssessment(brainAssessment()).valid, true);
});

test("runtime Brain validator rejects signal states with unverified live data", () => {
  const assessment = brainAssessment();
  assessment.liveData.status = "PARTIAL";
  assert.equal(validateBrainAssessment(assessment).valid, false);
});

test("runtime Brain validator rejects any enabled order submission", () => {
  const assessment = brainAssessment();
  assessment.orderSubmissionAvailable = true;
  assert.equal(validateBrainAssessment(assessment).valid, false);
});
