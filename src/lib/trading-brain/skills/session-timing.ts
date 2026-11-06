import type { BrainSkillResult, SkillSourceReference } from "./types";

export type SessionEventImpact = "LOW" | "MEDIUM" | "HIGH" | "UNSPECIFIED";
export type SessionEventState = "IN_PROGRESS" | "UPCOMING" | "OUTSIDE_WINDOW";

export interface TradingSessionDefinition {
  id: string;
  name: string;
  timeZone: string;
  /** Local wall-clock time in HH:mm, interpreted in timeZone. */
  startLocal: string;
  /** Local wall-clock time in HH:mm, interpreted in timeZone. */
  endLocal: string;
  /** ISO weekday numbers: Sunday=0 through Saturday=6; applies to session start day. */
  weekdays: number[];
  verifiedAt: string;
  sourceReferences: SkillSourceReference[];
}

export interface ScheduledSessionEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  impact: SessionEventImpact;
  currencies: string[];
  sourceReferences: SkillSourceReference[];
}

export interface SessionTimingInput {
  instrument: string;
  /** Explicit currency relevance, e.g. ["USD", "EUR"] for EURUSD. */
  instrumentCurrencies: string[];
  asOf: string;
  sessions: TradingSessionDefinition[];
  events: ScheduledSessionEvent[];
}

export interface SessionTimingPolicy {
  maximumCalendarAgeSeconds: number;
  upcomingEventHorizonMinutes: number;
  requireEventProvenance: boolean;
}

export interface ActiveSession {
  id: string;
  name: string;
  timeZone: string;
  localTime: string;
  crossesMidnight: boolean;
}

export interface RelevantSessionEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  impact: SessionEventImpact;
  matchedCurrencies: string[];
  state: SessionEventState;
  secondsUntilStart: number;
}

export interface SessionTimingAssessment {
  instrument: string;
  activeSessions: ActiveSession[];
  sessionState: "ACTIVE" | "OUTSIDE_DEFINED_SESSIONS" | "UNAVAILABLE";
  relevantEvents: RelevantSessionEvent[];
  sessionRange: null;
  sessionRangeStatus: "NOT_CALCULATED_NO_CANDLE_INPUT";
}

export interface SessionTimingFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "INVALID_AS_OF"
    | "INVALID_SESSION_DEFINITION"
    | "INVALID_TIMEZONE"
    | "SESSION_PROVENANCE_MISSING"
    | "CALENDAR_STALE"
    | "CALENDAR_TIMESTAMP_INVALID"
    | "INVALID_EVENT_WINDOW"
    | "EVENT_PROVENANCE_MISSING"
    | "INSTRUMENT_CURRENCIES_MISSING";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "session-timing/0.1.0";
const WEEKDAY_BY_NAME: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function parseAbsoluteTimestamp(value: string): number {\n  if (typeof value !== "string" || !/T.*(?:Z|[+-]\\d{2}:\\d{2})$/.test(value)) return Number.NaN;\n  return Date.parse(value);\n}\n\nfunction parseClock(value: string): number | null {
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function zonedClock(at: Date, timeZone: string): { dateKey: string; weekday: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const weekday = WEEKDAY_BY_NAME[values.weekday];
    if (weekday === undefined) return null;
    return {
      dateKey: `${values.year}-${values.month}-${values.day}`,
      weekday,
      minute: Number(values.hour) * 60 + Number(values.minute),
    };
  } catch {
    return null;
  }
}

function previousDate(dateKey: string): { weekday: number } | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day) - 86_400_000);
  if (!Number.isFinite(date.getTime())) return null;
  return { weekday: date.getUTCDay() };
}

function emptyAssessment(instrument: string): SessionTimingAssessment {
  return {
    instrument,
    activeSessions: [],
    sessionState: "UNAVAILABLE",
    relevantEvents: [],
    sessionRange: null,
    sessionRangeStatus: "NOT_CALCULATED_NO_CANDLE_INPUT",
  };
}

function buildResult(
  input: SessionTimingInput,
  findings: SessionTimingFinding[],
  assessment: SessionTimingAssessment,
  status: BrainSkillResult<SessionTimingFinding>["status"],
  readiness: BrainSkillResult<SessionTimingFinding>["evidenceReadiness"],
): BrainSkillResult<SessionTimingFinding> & { assessment: SessionTimingAssessment } {
  const references = [
    ...input.sessions.flatMap((session) => session.sourceReferences),
    ...input.events.flatMap((event) => event.sourceReferences),
  ];
  return {
    skillId: "session-timing",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: [
      `Session state: ${assessment.sessionState.toLowerCase().replaceAll("_", " ")}.`,
      ...assessment.activeSessions.map((session) =>
        `${session.name} is active at ${session.localTime} (${session.timeZone}).`
      ),
      ...assessment.relevantEvents.map((event) =>
        `${event.title}: ${event.state.toLowerCase().replaceAll("_", " ")}.`
      ),
    ],
    interpretations: assessment.relevantEvents.some((event) => event.state !== "OUTSIDE_WINDOW")
      ? ["A relevant scheduled event window is active or approaching; event risk should be considered separately from directional evidence."]
      : [],
    supportingEvidence: assessment.activeSessions.map((session) => `Explicit session schedule ${session.id} is active.`),
    contraryEvidence: [],
    uncertainties: [
      "Session schedules and event windows are caller-supplied; this module does not discover market hours, holidays, or economic events.",
      "Local wall-clock evaluation follows the supplied IANA timezone, including daylight-saving changes; repeated local times during a fall-back transition are not distinguished.",
    ],
    sourceReferences: references,
    limitations: [
      "Session activity is a calendar classification, not proof of liquidity, volatility, or tradability.",
      "Session range is not calculated because no validated OHLC candle input is supplied.",
      "Event impact is reported as supplied and is never inferred from the event title.",
      "This module does not produce BUY, SELL, entry, stop, target, or a confidence score.",
    ],
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

/** Evaluate only explicitly supplied schedules and event windows; never infer market hours. */
export function assessSessionTiming(
  input: SessionTimingInput,
  policy?: SessionTimingPolicy,
): BrainSkillResult<SessionTimingFinding> & { assessment: SessionTimingAssessment } {
  if (!policy) {
    return buildResult(input, [{ code: "POLICY_MISSING", message: "An explicit calendar freshness and event-horizon policy is required." }], emptyAssessment(input.instrument), "INCOMPLETE", "INCOMPLETE");
  }
  if (
    !Number.isFinite(policy.maximumCalendarAgeSeconds) ||
    policy.maximumCalendarAgeSeconds < 0 ||
    !Number.isFinite(policy.upcomingEventHorizonMinutes) ||
    policy.upcomingEventHorizonMinutes < 0 ||
    typeof policy.requireEventProvenance !== "boolean"
  ) {
    return buildResult(input, [{ code: "INVALID_POLICY", message: "Calendar age, event horizon, and event provenance requirements must be explicit and non-negative." }], emptyAssessment(input.instrument), "REJECTED", "INCOMPLETE");
  }

  const asOfMs = parseAbsoluteTimestamp(input.asOf);
  if (!Number.isFinite(asOfMs)) {
    return buildResult(input, [{ code: "INVALID_AS_OF", message: "Evaluation time must be a valid absolute timestamp." }], emptyAssessment(input.instrument), "REJECTED", "INCOMPLETE");
  }
  if (!Array.isArray(input.instrumentCurrencies) || input.instrumentCurrencies.length === 0) {
    return buildResult(input, [{ code: "INSTRUMENT_CURRENCIES_MISSING", message: "Explicit instrument currency relevance is required before filtering economic events." }], emptyAssessment(input.instrument), "INCOMPLETE", "INCOMPLETE");
  }

  const findings: SessionTimingFinding[] = [];
  const activeSessions: ActiveSession[] = [];
  for (const session of input.sessions) {
    const start = parseClock(session.startLocal);
    const end = parseClock(session.endLocal);
    const weekdaysValid = Array.isArray(session.weekdays) &&
      session.weekdays.length > 0 &&
      new Set(session.weekdays).size === session.weekdays.length &&
      session.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    if (!session.id || !session.name || start === null || end === null || start === end || !weekdaysValid) {
      findings.push({ code: "INVALID_SESSION_DEFINITION", message: `Session ${session.id || "(unnamed)"} has invalid local times or weekdays.` });
      continue;
    }
    const local = zonedClock(new Date(asOfMs), session.timeZone);
    if (!local) {
      findings.push({ code: "INVALID_TIMEZONE", message: `Session ${session.id} has an invalid or unsupported IANA timezone.` });
      continue;
    }
    if (!Array.isArray(session.sourceReferences) || session.sourceReferences.length === 0) {
      findings.push({ code: "SESSION_PROVENANCE_MISSING", message: `Session ${session.id} has no schedule provenance.` });
      continue;
    }
    const verifiedAt = parseAbsoluteTimestamp(session.verifiedAt);
    if (!Number.isFinite(verifiedAt) || verifiedAt > asOfMs) {
      findings.push({ code: "CALENDAR_TIMESTAMP_INVALID", message: `Session ${session.id} has an invalid or future verification timestamp.` });
      continue;
    }
    if ((asOfMs - verifiedAt) / 1000 > policy.maximumCalendarAgeSeconds) {
      findings.push({ code: "CALENDAR_STALE", message: `Session ${session.id} schedule exceeds the configured freshness limit.` });
      continue;
    }

    const crossesMidnight = start > end;
    const activeToday = session.weekdays.includes(local.weekday) &&
      (crossesMidnight ? local.minute >= start : local.minute >= start && local.minute < end);
    const previous = crossesMidnight ? previousDate(local.dateKey) : null;
    const activeFromPreviousDay = Boolean(previous) &&
      session.weekdays.includes(previous!.weekday) &&
      local.minute < end;
    if (activeToday || activeFromPreviousDay) {
      activeSessions.push({
        id: session.id,
        name: session.name,
        timeZone: session.timeZone,
        localTime: `${String(Math.floor(local.minute / 60)).padStart(2, "0")}:${String(local.minute % 60).padStart(2, "0")}`,
        crossesMidnight,
      });
    }
  }

  const relevantEvents: RelevantSessionEvent[] = [];
  for (const event of input.events) {
    const startsAt = Date.parse(event.startsAt);
    const endsAt = Date.parse(event.endsAt);
    if (!event.id || !event.title || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
      findings.push({ code: "INVALID_EVENT_WINDOW", message: `Event ${event.id || "(unnamed)"} has an invalid time window.` });
      continue;
    }
    if (policy.requireEventProvenance && (!Array.isArray(event.sourceReferences) || event.sourceReferences.length === 0)) {
      findings.push({ code: "EVENT_PROVENANCE_MISSING", message: `Event ${event.id} has no source provenance.` });
      continue;
    }
    const matchedCurrencies = [...new Set(event.currencies.map((currency) => currency.toUpperCase()))]
      .filter((currency) => input.instrumentCurrencies.map((value) => value.toUpperCase()).includes(currency));
    if (matchedCurrencies.length === 0) continue;
    const secondsUntilStart = (startsAt - asOfMs) / 1000;
    const inProgress = asOfMs >= startsAt && asOfMs < endsAt;
    const upcoming = secondsUntilStart > 0 && secondsUntilStart <= policy.upcomingEventHorizonMinutes * 60;
    relevantEvents.push({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      impact: event.impact,
      matchedCurrencies,
      state: inProgress ? "IN_PROGRESS" : upcoming ? "UPCOMING" : "OUTSIDE_WINDOW",
      secondsUntilStart,
    });
  }

  const hardBlock = findings.some((finding) =>
    finding.code === "INVALID_SESSION_DEFINITION" ||
    finding.code === "INVALID_TIMEZONE" ||
    finding.code === "SESSION_PROVENANCE_MISSING" ||
    finding.code === "CALENDAR_TIMESTAMP_INVALID" ||
    finding.code === "CALENDAR_STALE" ||
    finding.code === "INVALID_EVENT_WINDOW" ||
    finding.code === "EVENT_PROVENANCE_MISSING"
  );
  const assessment: SessionTimingAssessment = {
    instrument: input.instrument,
    activeSessions,
    sessionState: hardBlock ? "UNAVAILABLE" : activeSessions.length > 0 ? "ACTIVE" : "OUTSIDE_DEFINED_SESSIONS",
    relevantEvents: relevantEvents.sort((a, b) => a.secondsUntilStart - b.secondsUntilStart),
    sessionRange: null,
    sessionRangeStatus: "NOT_CALCULATED_NO_CANDLE_INPUT",
  };
  if (hardBlock) return buildResult(input, findings, assessment, "INCOMPLETE", "DEGRADED");
  return buildResult(input, findings, assessment, "COMPLETE", "READY");
}
