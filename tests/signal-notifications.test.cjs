/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");

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

const {
  buildSignalNotification,
  shouldDeliverSignalNotification,
} = require("../src/lib/trading-brain/signal-notifications.ts");

const base = {
  signalId: "sig-test-001",
  instrument: "EURUSD",
  track: "CURRENT",
  status: "MONITORING",
  previousStatus: "PREPARING",
  revision: 1,
};

test("only a newly active signal creates an activation email event", () => {
  const event = buildSignalNotification({
    ...base,
    status: "ACTIVE",
    previousStatus: "MONITORING",
  });
  assert.equal(event.kind, "SIGNAL_ACTIVE");
  assert.equal(event.subject, "EURUSD signal is now active");
  assert.match(event.idempotencyKey, /sig-test-001:SIGNAL_ACTIVE:v1/);
});

test("monitoring, preparing and first-time suspended signals do not email", () => {
  for (const status of ["PREPARING", "MONITORING", "SUSPENDED"]) {
    assert.equal(buildSignalNotification({ ...base, status }), null);
  }
});

test("repeated ACTIVE state does not create duplicate activation email", () => {
  assert.equal(buildSignalNotification({
    ...base,
    status: "ACTIVE",
    previousStatus: "ACTIVE",
  }), null);
});

test("an active signal sends a meaningful suspension update", () => {
  const event = buildSignalNotification({
    ...base,
    status: "SUSPENDED",
    previousStatus: "ACTIVE",
  });
  assert.equal(event.kind, "SIGNAL_SUSPENDED");
  assert.match(event.summary, /Do not treat this signal as actionable/);
});

test("an active signal sends invalidation and expiry updates", () => {
  const invalidated = buildSignalNotification({
    ...base,
    status: "INVALIDATED",
    previousStatus: "ACTIVE",
  });
  const expired = buildSignalNotification({
    ...base,
    status: "EXPIRED",
    previousStatus: "ACTIVE",
  });
  assert.equal(invalidated.kind, "SIGNAL_INVALIDATED");
  assert.equal(expired.kind, "SIGNAL_EXPIRED");
});

test("notification delivery is idempotent for an already delivered event key", () => {
  const event = buildSignalNotification({
    ...base,
    status: "ACTIVE",
    previousStatus: "MONITORING",
  });
  assert.equal(shouldDeliverSignalNotification(event, new Set()), true);
  assert.equal(shouldDeliverSignalNotification(event, new Set([event.idempotencyKey])), false);
});

test("invalid identifiers and revisions fail closed", () => {
  assert.equal(buildSignalNotification({ ...base, signalId: " ", status: "ACTIVE" }), null);
  assert.equal(buildSignalNotification({ ...base, revision: 0, status: "ACTIVE" }), null);
});
