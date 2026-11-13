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
  decideMT5Replay,
  hashMT5BatchPayload,
  hashMT5CollectorToken,
  isWithinMT5ClockSkew,
  stableMT5Json,
} = require("../src/lib/market-data/mt5-ingest-server.ts");

test("collector credentials are hashed and short credentials are rejected", () => {
  const token = "tvmt5_" + "a".repeat(48);
  const hash = hashMT5CollectorToken(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(hashMT5CollectorToken("too-short"), null);
});

test("stable batch serialization is independent of object key order", () => {
  assert.equal(stableMT5Json({ z: 1, a: { y: 2, b: 3 } }), stableMT5Json({ a: { b: 3, y: 2 }, z: 1 }));
  assert.equal(hashMT5BatchPayload({ z: 1, a: 2 }), hashMT5BatchPayload({ a: 2, z: 1 }));
});

test("same collector, terminal and payload is the only acknowledged replay", () => {
  const existing = {
    collector_credential_id: "credential-1",
    terminal_instance_id: "terminal-1",
    payload_hash: "a".repeat(64),
  };
  assert.equal(decideMT5Replay(existing, "credential-1", "terminal-1", "a".repeat(64)), "ACK_DUPLICATE");
  assert.equal(decideMT5Replay(existing, "credential-2", "terminal-1", "a".repeat(64)), "CONFLICT");
  assert.equal(decideMT5Replay(existing, "credential-1", "terminal-2", "a".repeat(64)), "CONFLICT");
  assert.equal(decideMT5Replay(existing, "credential-1", "terminal-1", "b".repeat(64)), "CONFLICT");
  assert.equal(decideMT5Replay({ ...existing, collector_credential_id: null }, "credential-1", "terminal-1", "a".repeat(64)), "CONFLICT");
});

test("batch sent time must remain within the configured clock-skew window", () => {
  const now = Date.parse("2026-11-13T12:00:00.000Z");
  assert.equal(isWithinMT5ClockSkew("2026-11-13T12:04:59.000Z", 300, now), true);
  assert.equal(isWithinMT5ClockSkew("2026-11-13T12:05:01.000Z", 300, now), false);
  assert.equal(isWithinMT5ClockSkew("not-a-date", 300, now), false);
});
