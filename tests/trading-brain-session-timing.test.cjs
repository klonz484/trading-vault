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

const { assessSessionTiming } = require("../src/lib/trading-brain/skills/session-timing.ts");

const source = {
  sourceId: "calendar-v1",
  providerId: "test-calendar",
  observedAt: "2026-11-06T10:00:00.000Z",
  receivedAt: "2026-11-06T10:00:01.000Z",
  instrument: "EURUSD",
  timeframe: "calendar",
};

function session(overrides = {}) {
  return {
    id: "london",
    name: "London",
    timeZone: "Europe/London",
    startLocal: "08:00",
    endLocal: "17:00",
    weekdays: [1, 2, 3, 4, 5],
    verifiedAt: "2026-11-06T09:00:00.000Z",
    sourceReferences: [source],
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    instrument: "EURUSD",
    instrumentCurrencies: ["EUR", "USD"],
    asOf: "2026-11-06T14:00:00.000Z",
    sessions: [session()],
    events: [],
    ...overrides,
  };
}

const policy = {
  maximumCalendarAgeSeconds: 86_400,
  upcomingEventHorizonMinutes: 60,
  requireEventProvenance: true,
};

test("requires explicit calendar and event timing policy", () => {
  const result = assessSessionTiming(input());
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.findings[0].code, "POLICY_MISSING");
});

test("identifies a session using its explicit IANA timezone and local hours", () => {
  const result = assessSessionTiming(input(), policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.assessment.sessionState, "ACTIVE");
  assert.equal(result.assessment.activeSessions[0].name, "London");
  assert.equal(result.assessment.activeSessions[0].localTime, "14:00");
});

test("uses timezone wall-clock rules across a daylight-saving transition", () => {
  const result = assessSessionTiming(input({
    asOf: "2026-03-08T07:30:00.000Z",
    sessions: [session({
      id: "new-york",
      name: "New York",
      timeZone: "America/New_York",
      startLocal: "01:00",
      endLocal: "04:00",
      weekdays: [0],
      verifiedAt: "2026-03-08T06:00:00.000Z",
    })],
  }), policy);
  assert.equal(result.assessment.sessionState, "ACTIVE");
  assert.equal(result.assessment.activeSessions[0].localTime, "03:30");
});

test("supports overnight sessions based on the explicitly defined start weekday", () => {
  const result = assessSessionTiming(input({
    asOf: "2026-11-07T01:00:00.000Z",
    sessions: [session({
      id: "tokyo",
      name: "Overnight",
      timeZone: "UTC",
      startLocal: "22:00",
      endLocal: "06:00",
      weekdays: [5],
      verifiedAt: "2026-11-06T09:00:00.000Z",
    })],
  }), policy);
  assert.equal(result.assessment.sessionState, "ACTIVE");
  assert.equal(result.assessment.activeSessions[0].crossesMidnight, true);
});

test("preserves only relevant, explicitly sourced upcoming and active events", () => {
  const result = assessSessionTiming(input({
    events: [
      {
        id: "usd-event",
        title: "Scheduled USD event",
        startsAt: "2026-11-06T14:30:00.000Z",
        endsAt: "2026-11-06T15:00:00.000Z",
        impact: "HIGH",
        currencies: ["USD"],
        sourceReferences: [source],
      },
      {
        id: "unrelated",
        title: "JPY event",
        startsAt: "2026-11-06T14:10:00.000Z",
        endsAt: "2026-11-06T14:20:00.000Z",
        impact: "UNSPECIFIED",
        currencies: ["JPY"],
        sourceReferences: [source],
      },
    ],
  }), policy);
  assert.equal(result.assessment.relevantEvents.length, 1);
  assert.equal(result.assessment.relevantEvents[0].state, "UPCOMING");
  assert.deepEqual(result.assessment.relevantEvents[0].matchedCurrencies, ["USD"]);
});

test("blocks a missing event source when provenance is required", () => {
  const result = assessSessionTiming(input({
    events: [{
      id: "unsourced",
      title: "Unverified event",
      startsAt: "2026-11-06T14:30:00.000Z",
      endsAt: "2026-11-06T15:00:00.000Z",
      impact: "UNSPECIFIED",
      currencies: ["USD"],
      sourceReferences: [],
    }],
  }), policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.ok(result.findings.some((finding) => finding.code === "EVENT_PROVENANCE_MISSING"));
});

test("rejects invalid timezone, stale schedules, and malformed session definitions", () => {
  const invalidZone = assessSessionTiming(input({
    sessions: [session({ timeZone: "Mars/Olympus" })],
  }), policy);
  assert.ok(invalidZone.findings.some((finding) => finding.code === "INVALID_TIMEZONE"));

  const stale = assessSessionTiming(input({
    sessions: [session({ verifiedAt: "2026-11-01T09:00:00.000Z" })],
  }), policy);
  assert.ok(stale.findings.some((finding) => finding.code === "CALENDAR_STALE"));

  const malformed = assessSessionTiming(input({
    sessions: [session({ startLocal: "25:00" })],
  }), policy);
  assert.ok(malformed.findings.some((finding) => finding.code === "INVALID_SESSION_DEFINITION"));
});

test("does not infer that the market is closed when no session schedule is supplied", () => {
  const result = assessSessionTiming(input({ sessions: [], events: [] }), policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.assessment.sessionState, "UNAVAILABLE");
  assert.ok(result.findings.some((finding) => finding.code === "SESSION_SCHEDULE_MISSING"));
  assert.equal(result.assessment.sessionRange, null);
  assert.equal(result.assessment.sessionRangeStatus, "NOT_CALCULATED_NO_CANDLE_INPUT");
  assert.deepEqual(result.assessment.relevantEvents, []);
});

test("rejects future and malformed event windows", () => {
  const result = assessSessionTiming(input({
    events: [{
      id: "bad",
      title: "Bad event",
      startsAt: "not-a-date",
      endsAt: "2026-11-06T15:00:00.000Z",
      impact: "UNSPECIFIED",
      currencies: ["USD"],
      sourceReferences: [source],
    }],
  }), policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.ok(result.findings.some((finding) => finding.code === "INVALID_EVENT_WINDOW"));
});
