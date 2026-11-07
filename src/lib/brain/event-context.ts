/**
 * Session and scheduled-news context from explicitly verified UTC schedules.
 * No broker timezone, DST conversion, calendar feed or news impact is inferred.
 */
export const EVENT_CONTEXT_VERSION = "0.1.0" as const;
export type UtcWindow = { id: string; label: string; startUtc: string; endUtc: string; sourceId: string; verified: boolean };
export type ScheduledEvent = { id: string; title: string; timeUtc: string; currencies: string[]; impact: "LOW" | "MEDIUM" | "HIGH"; sourceId: string; verified: boolean };
export type EventContextInput = {
  instrument: string;
  instrumentCurrencies: string[];
  asOfUtc: string;
  sessionWindows: UtcWindow[];
  newsEvents: ScheduledEvent[];
  newsBlockBeforeMs: number;
  newsBlockAfterMs: number;
  relevantImpacts: Array<"LOW" | "MEDIUM" | "HIGH">;
};
export type EventContextResult = {
  engineVersion: typeof EVENT_CONTEXT_VERSION;
  status: "READY" | "INCOMPLETE" | "INVALID";
  instrument: string;
  asOfUtc: string;
  session: { status: "ACTIVE" | "OUTSIDE" | "UNKNOWN"; active: string[]; sourceIds: string[] };
  news: { status: "CLEAR" | "RESTRICTED_WINDOW" | "UNKNOWN"; relevantEvents: Array<{ id: string; title: string; timeUtc: string; impact: "LOW" | "MEDIUM" | "HIGH"; minutesFromEvent: number; currencies: string[]; sourceId: string }> };
  warnings: string[];
  tradeSignalGenerated: false;
};
const parse = (v: string) => Date.parse(v);
export function evaluateEventContext(input: EventContextInput): EventContextResult {
  const warnings: string[] = [];
  const now = parse(input.asOfUtc);
  if (!input.instrument?.trim()) warnings.push("Instrument is required.");
  if (!Number.isFinite(now)) warnings.push("asOfUtc must be a valid UTC timestamp.");
  if (!Array.isArray(input.instrumentCurrencies) || input.instrumentCurrencies.length === 0 || input.instrumentCurrencies.some(c => !/^[A-Z]{3}$/.test(c))) warnings.push("Explicit three-letter instrument currencies are required.");
  if (!Number.isFinite(input.newsBlockBeforeMs) || input.newsBlockBeforeMs < 0 || !Number.isFinite(input.newsBlockAfterMs) || input.newsBlockAfterMs < 0) warnings.push("News restriction windows must be non-negative finite milliseconds.");
  if (!Array.isArray(input.relevantImpacts) || input.relevantImpacts.length === 0) warnings.push("At least one relevant news impact tier must be configured.");
  const validSessions = input.sessionWindows.filter(w => w.verified && w.id?.trim() && w.label?.trim() && w.sourceId?.trim() && Number.isFinite(parse(w.startUtc)) && Number.isFinite(parse(w.endUtc)) && parse(w.endUtc) > parse(w.startUtc));
  if (validSessions.length !== input.sessionWindows.length) warnings.push("One or more session windows are unverified or malformed.");
  const validEvents = input.newsEvents.filter(e => e.verified && e.id?.trim() && e.title?.trim() && e.sourceId?.trim() && Number.isFinite(parse(e.timeUtc)) && Array.isArray(e.currencies) && e.currencies.every(c => /^[A-Z]{3}$/.test(c)) && ["LOW","MEDIUM","HIGH"].includes(e.impact));
  if (validEvents.length !== input.newsEvents.length) warnings.push("One or more scheduled news events are unverified or malformed.");
  const base = { engineVersion: EVENT_CONTEXT_VERSION, instrument: input.instrument, asOfUtc: input.asOfUtc, tradeSignalGenerated: false as const };
  if (warnings.length) return { ...base, status: "INVALID", session: { status: "UNKNOWN", active: [], sourceIds: [] }, news: { status: "UNKNOWN", relevantEvents: [] }, warnings };
  const active = validSessions.filter(w => now >= parse(w.startUtc) && now < parse(w.endUtc));
  const relevantEvents = validEvents.filter(e => e.currencies.some(c => input.instrumentCurrencies.includes(c)) && input.relevantImpacts.includes(e.impact))
    .filter(e => now >= parse(e.timeUtc) - input.newsBlockBeforeMs && now <= parse(e.timeUtc) + input.newsBlockAfterMs)
    .map(e => ({ id: e.id, title: e.title, timeUtc: e.timeUtc, impact: e.impact, minutesFromEvent: (parse(e.timeUtc) - now) / 60000, currencies: [...e.currencies], sourceId: e.sourceId }))
    .sort((a,b) => Math.abs(a.minutesFromEvent) - Math.abs(b.minutesFromEvent));
  return {
    ...base, status: "READY",
    session: { status: validSessions.length === 0 ? "UNKNOWN" : active.length ? "ACTIVE" : "OUTSIDE", active: active.map(w => w.label), sourceIds: active.map(w => w.sourceId) },
    news: { status: relevantEvents.length ? "RESTRICTED_WINDOW" : "CLEAR", relevantEvents },
    warnings: validSessions.length === 0 ? ["No verified session windows were supplied; session status is unknown."] : []
  };
}
