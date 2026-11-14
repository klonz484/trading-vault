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
const {
  resolveMT5Timestamp,
  isMT5TimestampLiveEligible,
} = require("../src/lib/market-data/mt5-timestamp-contract.ts");

const profile = {
  status: "APPROVED",
  serverId: "RCG-DEMO-01",
  version: "rcg-demo-clock-v1",
  evidenceRef: "support-confirmation:RCG-DEMO-01",
  approvedAtUtc: "2026-11-01T00:00:00.000Z",
  intervals: [
    {
      effectiveFromUtc: "2026-01-01T00:00:00.000Z",
      effectiveToUtc: "2026-03-29T01:00:00.000Z",
      utcOffsetSeconds: 3600,
    },
    {
      effectiveFromUtc: "2026-03-29T01:00:00.000Z",
      effectiveToUtc: "2026-10-25T01:00:00.000Z",
      utcOffsetSeconds: 7200,
    },
    {
      effectiveFromUtc: "2026-10-25T01:00:00.000Z",
      effectiveToUtc: "2027-01-01T00:00:00.000Z",
      utcOffsetSeconds: 3600,
    },
  ],
};

test("explicit UTC epoch values resolve without broker profile conversion", () => {
  const result = resolveMT5Timestamp({
    rawValue: 1794135540,
    rawUnit: "epoch_seconds",
    rawClockDomain: "UTC",
  });
  assert.equal(result.status, "VERIFIED_UTC");
  assert.equal(result.envelope.rawValue, 1794135540);
  assert.equal(result.envelope.resolvedUtc, new Date(1794135540000).toISOString());
});

test("explicit zoned ISO timestamps normalize to canonical UTC", () => {
  const result = resolveMT5Timestamp({
    rawValue: "2026-11-14T12:00:00+02:00",
    rawUnit: "server_wall_time",
    rawClockDomain: "UTC",
  });
  assert.equal(result.status, "VERIFIED_UTC");
  assert.equal(result.envelope.resolvedUtc, "2026-11-14T10:00:00.000Z");
});

test("unknown clock domain and unconfirmed broker epoch semantics stay unresolved", () => {
  const unknown = resolveMT5Timestamp({
    rawValue: 1794135540123,
    rawUnit: "epoch_milliseconds",
    rawClockDomain: "UNKNOWN",
  });
  assert.equal(unknown.status, "UNRESOLVED");

  const brokerEpoch = resolveMT5Timestamp({
    rawValue: 1794135540123,
    rawUnit: "epoch_milliseconds",
    rawClockDomain: "BROKER_SERVER",
  }, { serverId: "RCG-DEMO-01", profile });
  assert.equal(brokerEpoch.status, "UNRESOLVED");
  assert.equal(brokerEpoch.envelope.resolvedUtc, null);
});

test("broker wall time uses the historical offset, not the current offset", () => {
  const result = resolveMT5Timestamp({
    rawValue: "2026-01-15 12:00:00",
    rawUnit: "server_wall_time",
    rawClockDomain: "BROKER_SERVER",
  }, { serverId: "RCG-DEMO-01", profile });
  assert.equal(result.status, "VERIFIED_UTC");
  assert.equal(result.envelope.rawValue, "2026-01-15 12:00:00");
  assert.equal(result.envelope.resolvedUtc, "2026-01-15T11:00:00.000Z");
  assert.equal(result.envelope.utcOffsetSeconds, 3600);
  assert.equal(result.envelope.profileVersion, profile.version);
});

test("wrong server and absent profile cannot resolve broker wall time", () => {
  const input = {
    rawValue: "2026-01-15 12:00:00",
    rawUnit: "server_wall_time",
    rawClockDomain: "BROKER_SERVER",
  };
  assert.equal(resolveMT5Timestamp(input).status, "UNRESOLVED");
  assert.equal(resolveMT5Timestamp(input, {
    serverId: "RCG-LIVE-99", profile,
  }).status, "UNRESOLVED");
});

test("repeated DST wall time is ambiguous and cannot pass eligibility", () => {
  const result = resolveMT5Timestamp({
    rawValue: "2026-10-25 02:30:00",
    rawUnit: "server_wall_time",
    rawClockDomain: "BROKER_SERVER",
  }, { serverId: "RCG-DEMO-01", profile });
  assert.equal(result.status, "AMBIGUOUS");
  assert.equal(result.envelope.resolvedUtc, null);
  assert.equal(isMT5TimestampLiveEligible(result, profile.serverId, profile.version), false);
});

test("skipped DST wall time is invalid rather than guessed", () => {
  const result = resolveMT5Timestamp({
    rawValue: "2026-03-29 02:30:00",
    rawUnit: "server_wall_time",
    rawClockDomain: "BROKER_SERVER",
  }, { serverId: "RCG-DEMO-01", profile });
  assert.equal(result.status, "INVALID");
  assert.equal(result.envelope.resolvedUtc, null);
});

test("profile mismatch prevents live eligibility even after a valid resolution", () => {
  const result = resolveMT5Timestamp({
    rawValue: "2026-01-15 12:00:00",
    rawUnit: "server_wall_time",
    rawClockDomain: "BROKER_SERVER",
  }, { serverId: "RCG-DEMO-01", profile });
  assert.equal(isMT5TimestampLiveEligible(result, "RCG-DEMO-01", profile.version), true);
  assert.equal(isMT5TimestampLiveEligible(result, "RCG-DEMO-01", "different-version"), false);
  assert.equal(isMT5TimestampLiveEligible(result, "RCG-LIVE-99", profile.version), false);
});

test("invalid calendar dates and mismatched declared UTC units are rejected", () => {
  const invalid = resolveMT5Timestamp({
    rawValue: "2026-02-30 12:00:00",
    rawUnit: "server_wall_time",
    rawClockDomain: "BROKER_SERVER",
  }, { serverId: "RCG-DEMO-01", profile });
  assert.equal(invalid.status, "INVALID");

  const mismatch = resolveMT5Timestamp({
    rawValue: "2026-11-14T12:00:00Z",
    rawUnit: "epoch_seconds",
    rawClockDomain: "UTC",
  });
  assert.equal(mismatch.status, "INVALID");
});
