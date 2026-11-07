/**
 * Session and scheduled-news context from explicitly verified UTC schedules.
 * Calendar coverage and freshness are explicit; an empty unverified feed is never "CLEAR".
 */
export const EVENT_CONTEXT_VERSION = "0.2.0" as const;
export type UtcWindow = { id:string; label:string; startUtc:string; endUtc:string; sourceId:string; verified:boolean };
export type ScheduledEvent = { id:string; title:string; timeUtc:string; currencies:string[]; impact:"LOW"|"MEDIUM"|"HIGH"; sourceId:string; verified:boolean };
export type EventContextInput = {
 instrument:string; instrumentCurrencies:string[]; asOfUtc:string;
 sessionWindows:UtcWindow[]; newsEvents:ScheduledEvent[];
 newsCalendarVerified:boolean; newsCalendarAsOfUtc:string|null; newsCalendarMaxAgeMs:number;
 newsBlockBeforeMs:number; newsBlockAfterMs:number; relevantImpacts:Array<"LOW"|"MEDIUM"|"HIGH">
};
export type EventContextResult = {
 engineVersion:typeof EVENT_CONTEXT_VERSION; status:"READY"|"INCOMPLETE"|"INVALID"; instrument:string; asOfUtc:string;
 session:{status:"ACTIVE"|"OUTSIDE"|"UNKNOWN";active:string[];sourceIds:string[]};
 news:{status:"CLEAR"|"RESTRICTED_WINDOW"|"UNKNOWN";relevantEvents:Array<{id:string;title:string;timeUtc:string;impact:"LOW"|"MEDIUM"|"HIGH";minutesFromEvent:number;currencies:string[];sourceId:string}>};
 warnings:string[];tradeSignalGenerated:false
};
const utc=(v:string|null)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v));
export function evaluateEventContext(input:EventContextInput):EventContextResult{
 const errors:string[]=[],warnings:string[]=[];
 const now=utc(input.asOfUtc)?Date.parse(input.asOfUtc):NaN;
 if(!input.instrument?.trim())errors.push("Instrument is required.");
 if(!Number.isFinite(now))errors.push("asOfUtc must be an ISO-8601 UTC timestamp ending in Z.");
 if(!Array.isArray(input.instrumentCurrencies)||input.instrumentCurrencies.length===0||input.instrumentCurrencies.some(c=>!/^[A-Z]{3}$/.test(c)))errors.push("Explicit three-letter instrument currencies are required.");
 if(!Number.isFinite(input.newsBlockBeforeMs)||input.newsBlockBeforeMs<0||!Number.isFinite(input.newsBlockAfterMs)||input.newsBlockAfterMs<0)errors.push("News restriction windows must be non-negative finite milliseconds.");
 if(!Array.isArray(input.relevantImpacts)||input.relevantImpacts.length===0||input.relevantImpacts.some(x=>!["LOW","MEDIUM","HIGH"].includes(x)))errors.push("Valid relevant news impact tiers must be configured.");
 if(!Number.isFinite(input.newsCalendarMaxAgeMs)||input.newsCalendarMaxAgeMs<0)errors.push("News calendar freshness limit must be non-negative and finite.");
 const validSessions=(input.sessionWindows??[]).filter(w=>w.verified&&w.id?.trim()&&w.label?.trim()&&w.sourceId?.trim()&&utc(w.startUtc)&&utc(w.endUtc)&&Date.parse(w.endUtc)>Date.parse(w.startUtc));
 if(validSessions.length!==(input.sessionWindows??[]).length)errors.push("One or more session windows are unverified or malformed.");
 const validEvents=(input.newsEvents??[]).filter(e=>e.verified&&e.id?.trim()&&e.title?.trim()&&e.sourceId?.trim()&&utc(e.timeUtc)&&Array.isArray(e.currencies)&&e.currencies.length>0&&e.currencies.every(c=>/^[A-Z]{3}$/.test(c))&&["LOW","MEDIUM","HIGH"].includes(e.impact));
 if(validEvents.length!==(input.newsEvents??[]).length)errors.push("One or more scheduled news events are unverified or malformed.");
 const base={engineVersion:EVENT_CONTEXT_VERSION,instrument:input.instrument,asOfUtc:input.asOfUtc,tradeSignalGenerated:false as const};
 if(errors.length)return {...base,status:"INVALID",session:{status:"UNKNOWN" as const,active:[],sourceIds:[]},news:{status:"UNKNOWN" as const,relevantEvents:[]},warnings:errors};
 const active=validSessions.filter(w=>now>=Date.parse(w.startUtc)&&now<Date.parse(w.endUtc));
 const calendarTime=utc(input.newsCalendarAsOfUtc)?Date.parse(input.newsCalendarAsOfUtc):NaN;
 const calendarFresh= input.newsCalendarVerified===true&&Number.isFinite(calendarTime)&&calendarTime<=now&&now-calendarTime<=input.newsCalendarMaxAgeMs;
 if(!calendarFresh)warnings.push("News calendar coverage is unverified, missing or stale; no-news status cannot be asserted.");
 if(validSessions.length===0)warnings.push("No verified session windows were supplied; session status is unknown.");
 const relevantEvents=calendarFresh?validEvents.filter(e=>e.currencies.some(c=>input.instrumentCurrencies.includes(c))&&input.relevantImpacts.includes(e.impact))
  .filter(e=>now>=Date.parse(e.timeUtc)-input.newsBlockBeforeMs&&now<=Date.parse(e.timeUtc)+input.newsBlockAfterMs)
  .map(e=>({id:e.id,title:e.title,timeUtc:e.timeUtc,impact:e.impact,minutesFromEvent:(Date.parse(e.timeUtc)-now)/60000,currencies:[...e.currencies],sourceId:e.sourceId}))
  .sort((a,b)=>Math.abs(a.minutesFromEvent)-Math.abs(b.minutesFromEvent)):[];
 return {...base,status:calendarFresh?"READY":"INCOMPLETE",
  session:{status:validSessions.length===0?"UNKNOWN":active.length?"ACTIVE":"OUTSIDE",active:active.map(w=>w.label),sourceIds:active.map(w=>w.sourceId)},
  news:{status:!calendarFresh?"UNKNOWN":relevantEvents.length?"RESTRICTED_WINDOW":"CLEAR",relevantEvents},warnings};
}
