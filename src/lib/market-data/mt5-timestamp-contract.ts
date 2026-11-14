/**
 * MT5 timestamp contract v2.
 *
 * Raw broker values are immutable. Conversion is possible only with an
 * explicitly approved, server-specific UTC offset schedule. No host timezone,
 * current offset, or guessed broker convention is consulted here.
 */
export type MT5RawTimestampUnit =
  | "epoch_seconds"
  | "epoch_milliseconds"
  | "server_wall_time";

export type MT5RawClockDomain = "BROKER_SERVER" | "UTC" | "UNKNOWN";
export type MT5TimestampResolutionStatus =
  | "VERIFIED_UTC"
  | "AMBIGUOUS"
  | "UNRESOLVED"
  | "INVALID";

export interface MT5TimestampEnvelope {
  rawValue: string | number;
  rawUnit: MT5RawTimestampUnit;
  rawClockDomain: MT5RawClockDomain;
  rawWallTime: string | null;
  resolvedUtc: string | null;
  resolutionStatus: MT5TimestampResolutionStatus;
  serverId: string | null;
  profileVersion: string | null;
  utcOffsetSeconds: number | null;
  evidenceRef: string | null;
}

export interface MT5ClockOffsetInterval {
  /** Inclusive UTC start of the interval. */
  effectiveFromUtc: string;
  /** Exclusive UTC end of the interval. */
  effectiveToUtc: string;
  utcOffsetSeconds: number;
}

export interface ApprovedMT5ClockProfile {
  status: "APPROVED";
  serverId: string;
  version: string;
  evidenceRef: string;
  approvedAtUtc: string;
  intervals: MT5ClockOffsetInterval[];
}

export interface MT5TimestampResolution {
  envelope: MT5TimestampEnvelope;
  status: MT5TimestampResolutionStatus;
  reason: string;
}

const WALL_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;
const EXPLICIT_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function canonicalIso(ms: number): string | null {
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return null;
  return new Date(ms).toISOString();
}

function parseWallTime(value: string): number | null {
  const match = WALL_TIME.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, fraction = ""] = match;
  const year = Number(y), month = Number(mo), day = Number(d);
  const hour = Number(h), minute = Number(mi), second = Number(s);
  const millisecond = Number((fraction + "000").slice(0, 3));
  if (
    month < 1 || month > 12 || day < 1 || day > 31 ||
    hour > 23 || minute > 59 || second > 59
  ) return null;
  const ms = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const date = new Date(ms);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second ? ms : null;
}

function baseEnvelope(
  rawValue: string | number,
  rawUnit: MT5RawTimestampUnit,
  rawClockDomain: MT5RawClockDomain,
  rawWallTime: string | null,
): MT5TimestampEnvelope {
  return {
    rawValue,
    rawUnit,
    rawClockDomain,
    rawWallTime,
    resolvedUtc: null,
    resolutionStatus: "UNRESOLVED",
    serverId: null,
    profileVersion: null,
    utcOffsetSeconds: null,
    evidenceRef: null,
  };
}

function result(
  envelope: MT5TimestampEnvelope,
  status: MT5TimestampResolutionStatus,
  reason: string,
): MT5TimestampResolution {
  return {
    envelope: { ...envelope, resolutionStatus: status },
    status,
    reason,
  };
}

/**
 * Resolves a timestamp without modifying rawValue. For broker wall time, the
 * approved schedule is evaluated by candidate UTC instant, which correctly
 * detects repeated and skipped DST wall-clock times.
 */
export function resolveMT5Timestamp(
  input: {
    rawValue: string | number;
    rawUnit: MT5RawTimestampUnit;
    rawClockDomain: MT5RawClockDomain;
    rawWallTime?: string | null;
  },
  context: {
    serverId?: string | null;
    profile?: ApprovedMT5ClockProfile | null;
  } = {},
): MT5TimestampResolution {
  const envelope = baseEnvelope(
    input.rawValue,
    input.rawUnit,
    input.rawClockDomain,
    input.rawWallTime ?? (input.rawUnit === "server_wall_time" && typeof input.rawValue === "string"
      ? input.rawValue
      : null),
  );

  if (
    (typeof input.rawValue !== "string" && typeof input.rawValue !== "number") ||
    (typeof input.rawValue === "number" && !Number.isSafeInteger(input.rawValue)) ||
    (typeof input.rawValue === "string" && input.rawValue.length === 0)
  ) return result(envelope, "INVALID", "Raw timestamp value is invalid.");

  if (input.rawClockDomain === "UNKNOWN") {
    return result(envelope, "UNRESOLVED", "Raw clock domain is unknown.");
  }

  if (input.rawClockDomain === "UTC") {
    let milliseconds: number | null = null;
    if (input.rawUnit === "epoch_seconds" && typeof input.rawValue === "number") {
      milliseconds = input.rawValue * 1000;
    } else if (input.rawUnit === "epoch_milliseconds" && typeof input.rawValue === "number") {
      milliseconds = input.rawValue;
    } else if (
      input.rawUnit === "server_wall_time" &&
      typeof input.rawValue === "string" &&
      EXPLICIT_ZONE.test(input.rawValue)
    ) {
      const parsed = Date.parse(input.rawValue);
      milliseconds = Number.isFinite(parsed) ? parsed : null;
    }
    const resolvedUtc = milliseconds === null ? null : canonicalIso(milliseconds);
    if (!resolvedUtc) return result(envelope, "INVALID", "UTC timestamp does not match its declared raw unit or is out of range.");
    return result({ ...envelope, resolvedUtc }, "VERIFIED_UTC", "Explicit UTC instant normalized without broker-time conversion.");
  }

  if (input.rawClockDomain !== "BROKER_SERVER") {
    return result(envelope, "UNRESOLVED", "Unsupported raw clock domain.");
  }
  if (input.rawUnit !== "server_wall_time" || typeof input.rawValue !== "string") {
    return result(envelope, "UNRESOLVED", "Broker epoch semantics are not approved; preserve the raw value and await broker confirmation.");
  }

  const profile = context.profile;
  if (
    !profile ||
    profile.status !== "APPROVED" ||
    !context.serverId ||
    profile.serverId !== context.serverId ||
    typeof profile.version !== "string" ||
    profile.version.trim().length === 0 ||
    typeof profile.evidenceRef !== "string" ||
    profile.evidenceRef.trim().length === 0 ||
    typeof profile.approvedAtUtc !== "string" ||
    !Number.isFinite(Date.parse(profile.approvedAtUtc)) ||
    !Array.isArray(profile.intervals) ||
    profile.intervals.length === 0
  ) {
    return result(envelope, "UNRESOLVED", "No valid approved clock profile matches this exact MT5 server.");
  }

  const wallMs = parseWallTime(input.rawWallTime ?? input.rawValue);
  if (wallMs === null) return result(envelope, "INVALID", "Broker wall-clock value is not a valid calendar timestamp.");

  const candidates: Array<{ utc: string; offset: number }> = [];
  for (const interval of profile.intervals) {
    if (!interval || typeof interval !== "object") continue;
    const from = Date.parse(interval.effectiveFromUtc);
    const to = Date.parse(interval.effectiveToUtc);
    if (
      typeof interval.effectiveFromUtc !== "string" ||
      typeof interval.effectiveToUtc !== "string" ||
      !Number.isFinite(from) || !Number.isFinite(to) || from >= to ||
      !Number.isInteger(interval.utcOffsetSeconds) ||
      Math.abs(interval.utcOffsetSeconds) > 86400
    ) continue;
    const candidateMs = wallMs - interval.utcOffsetSeconds * 1000;
    if (candidateMs >= from && candidateMs < to) {
      const utc = canonicalIso(candidateMs);
      if (utc) candidates.push({ utc, offset: interval.utcOffsetSeconds });
    }
  }

  if (candidates.length === 0) {
    return result(envelope, "INVALID", "No approved historical offset maps this wall time to a valid UTC interval (including possible DST gaps).");
  }
  if (candidates.length > 1) {
    return result(envelope, "AMBIGUOUS", "Multiple approved UTC instants match this repeated broker wall time.");
  }

  const candidate = candidates[0];
  return result({
    ...envelope,
    resolvedUtc: candidate.utc,
    serverId: profile.serverId,
    profileVersion: profile.version,
    utcOffsetSeconds: candidate.offset,
    evidenceRef: profile.evidenceRef,
  }, "VERIFIED_UTC", "Resolved with the exact server's approved historical offset schedule.");
}

/** Consumers must call this gate; a caller-supplied READY flag is not enough. */
export function isMT5TimestampLiveEligible(
  resolution: MT5TimestampResolution,
  expectedServerId: string,
  expectedProfileVersion: string,
): boolean {
  const e = resolution.envelope;
  return resolution.status === "VERIFIED_UTC" &&
    e.resolvedUtc !== null &&
    Number.isFinite(Date.parse(e.resolvedUtc)) &&
    new Date(e.resolvedUtc).toISOString() === e.resolvedUtc &&
    (e.rawClockDomain === "UTC" ||
      (e.rawClockDomain === "BROKER_SERVER" &&
        e.serverId === expectedServerId &&
        e.profileVersion === expectedProfileVersion &&
        typeof e.evidenceRef === "string" &&
        e.evidenceRef.length > 0 &&
        Number.isInteger(e.utcOffsetSeconds)));
}
