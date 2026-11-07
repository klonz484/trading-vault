/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const contracts = fs.readFileSync(path.join(process.cwd(), "src/lib/scanner/contracts.ts"), "utf8");
const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/scanner/analyze/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/scanner/page.tsx"), "utf8");

test("Scanner contract is versioned and explicitly context-only", () => {
  assert.match(contracts, /SCANNER_SCHEMA_VERSION = "1\.0\.0"/);
  assert.match(contracts, /contextOnlyNotSignal: true/);
  assert.match(contracts, /packetStatus: "COMPLETE" \| "INCOMPLETE"/);
});

test("observation packet preserves four distinct time references and timezone uncertainty", () => {
  for (const field of ["deviceTime", "chartOrBrokerTime", "lastCandleTime", "receiptTimeUtc", "timezoneOrBrokerOffset"]) {
    assert.ok(contracts.includes(field), `missing timestamp field: ${field}`);
  }
});

test("field confidence and provenance are represented independently", () => {
  assert.match(contracts, /confidence: number/);
  assert.match(contracts, /source: ObservationSource/);
  assert.match(contracts, /status: ObservationStatus/);
});

test("Brain contract separates data confidence from analytical confidence", () => {
  assert.match(contracts, /dataConfidence: number/);
  assert.match(contracts, /analyticalConfidence: number \| null/);
});

test("Brain signal states require verified live data and high data confidence", () => {
  assert.match(contracts, /liveData\?\.status !== "VERIFIED" \|\| !isConfidence\(dataConfidence\) \|\| dataConfidence < 0\.8/);
});

test("Brain output cannot enable order submission", () => {
  assert.match(contracts, /manualExecutionOnly: true/);
  assert.match(contracts, /orderSubmissionAvailable: false/);
  assert.match(contracts, /Automated execution must remain unavailable/);
});

test("Scanner API retains owner-only authentication", () => {
  assert.match(route, /TRADING_VAULT_OWNER_USER_ID/);
  assert.match(route, /await supabase\.auth\.getUser\(\)/);
  assert.match(route, /user\.id !== ownerUserId/);
});

test("Scanner API hashes original image bytes and records UTC receipt time", () => {
  assert.match(route, /createHash\("sha256"\)/);
  assert.match(route, /new Date\(\)\.toISOString\(\)/);
});

test("Scanner API requests visible facts only and prohibits signal generation", () => {
  assert.match(route, /perception-only OEM\+ ChartScanner/);
  assert.match(route, /MUST NOT analyze, recommend, predict/);
  assert.match(route, /No extra keys or prose/);
  assert.doesNotMatch(route, /const DECISIONS = new Set/);
});

test("Scanner API never returns a trade decision and reports Brain disconnected", () => {
  assert.match(route, /assessment: null/);
  assert.match(route, /brainStatus: "NOT_CONNECTED"/);
  assert.match(route, /contextOnlyNotSignal: true/);
});

test("Scanner UI labels output as observations, not a trade signal", () => {
  assert.match(page, /Observation packet/);
  assert.match(page, /Context only · Not a signal/);
  assert.match(page, /Trading Brain status: not connected/);
  assert.doesNotMatch(page, /Scanner decision/);
});

test("Scanner UI preserves mobile image upload and camera capture", () => {
  assert.match(page, /capture="environment"/);
  assert.match(page, /Browse files/);
  assert.match(page, /Take photo/);
});
