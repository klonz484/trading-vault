import type { BrainSkillResult, SkillSourceReference } from "../types";
export type ScalpingLatencyStage = "QUOTE_RECEIVED" | "DECISION_RECORDED" | "ORDER_SUBMITTED" | "FILL_RECORDED";
export interface ScalpingLatencyEvent { stage: ScalpingLatencyStage; timestamp: string; sequence: number; instrument: string; venueId: string }
export interface ScalpingLatencyInput { instrument: string; venueId: string; asOf: string; events: ScalpingLatencyEvent[]; clockSynchronizationVerified: boolean; sourceReferences: SkillSourceReference[] }
export interface ScalpingLatencyPolicy { maximumEventAgeSeconds: number; maximumClockUncertaintyMilliseconds: number; requireAllStages: boolean; requireSourceProvenance: boolean }
export interface ScalpingLatencyAssessment { eventCount: number; observedIntervalsMilliseconds: Partial<Record<"quoteToDecision" | "decisionToSubmit" | "submitToFill" | "quoteToFill", number>>; maximumClockUncertaintyMilliseconds: number | null; status: "MEASURED" | "NOT_ASSESSABLE"; limitations: string[] }
export interface ScalpingLatencyFinding { code: "POLICY_MISSING" | "INVALID_POLICY" | "INVALID_CLOCK_QUALITY" | "SOURCE_PROVENANCE_MISSING" | "INVALID_TIMESTAMP" | "STALE_EVENT" | "IDENTITY_MISMATCH" | "INVALID_SEQUENCE" | "MISSING_STAGE" | "NEGATIVE_INTERVAL"; message: string }
const VERSION="0.1.0", RULES="scalp-latency-execution/0.1.0";
function time(value:string):number { if(typeof value!=="string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return Number.NaN; return Date.parse(value); }
function result(input:ScalpingLatencyInput, findings:ScalpingLatencyFinding[], assessment:ScalpingLatencyAssessment, status:BrainSkillResult<ScalpingLatencyFinding>["status"]):BrainSkillResult<ScalpingLatencyFinding>&{assessment:ScalpingLatencyAssessment}{
return {skillId:"scalp-latency-execution",skillVersion:VERSION,status,evidenceReadiness:status==="COMPLETE"?"READY":"INCOMPLETE",findings,
observations:Object.entries(assessment.observedIntervalsMilliseconds).map(([key,value])=>key+": "+value+" ms observed."),
interpretations:[],supportingEvidence:status==="COMPLETE"?["Supplied lifecycle timestamps passed explicit clock, identity, sequence and freshness checks."]:[],
contraryEvidence:findings.map(x=>x.message),uncertainties:["Measurements describe supplied records only; they do not predict future latency or fill probability.","Clock synchronization and timestamp precision constrain measurement accuracy.","Recorded fills do not establish repeatable execution quality."],
sourceReferences:input.sourceReferences??[],limitations:assessment.limitations,ruleSetVersion:RULES,assessment};}
export function assessScalpingLatency(input:ScalpingLatencyInput,policy?:ScalpingLatencyPolicy,clockUncertaintyMilliseconds?:number):BrainSkillResult<ScalpingLatencyFinding>&{assessment:ScalpingLatencyAssessment}{
const assessment:ScalpingLatencyAssessment={eventCount:input.events.length,observedIntervalsMilliseconds:{},maximumClockUncertaintyMilliseconds:Number.isFinite(clockUncertaintyMilliseconds)?clockUncertaintyMilliseconds!:null,status:"NOT_ASSESSABLE",limitations:["Only caller-supplied quote, decision, submission and fill timestamps are measured.","No predictive latency, fill probability, routing recommendation, queue position or slippage forecast is produced.","No order submission, cancellation, routing or broker write action is performed."]};
const findings:ScalpingLatencyFinding[]=[];
if(!policy){findings.push({code:"POLICY_MISSING",message:"An explicit latency measurement policy is required."});return result(input,findings,assessment,"INCOMPLETE");}
if(!Number.isFinite(policy.maximumEventAgeSeconds)||policy.maximumEventAgeSeconds<0||!Number.isFinite(policy.maximumClockUncertaintyMilliseconds)||policy.maximumClockUncertaintyMilliseconds<0||typeof policy.requireAllStages!=="boolean"||typeof policy.requireSourceProvenance!=="boolean"){findings.push({code:"INVALID_POLICY",message:"Freshness, clock uncertainty and stage/provenance requirements must be explicit and valid."});return result(input,findings,assessment,"REJECTED");}
if(!input.clockSynchronizationVerified||!Number.isFinite(clockUncertaintyMilliseconds)||clockUncertaintyMilliseconds!<0||clockUncertaintyMilliseconds!>policy.maximumClockUncertaintyMilliseconds)findings.push({code:"INVALID_CLOCK_QUALITY",message:"Verified clock synchronization within the configured uncertainty limit is required."});
const asOf=time(input.asOf);
if(!Number.isFinite(asOf))findings.push({code:"INVALID_TIMESTAMP",message:"Evaluation time must be an absolute timestamp."});
if(policy.requireSourceProvenance&&!input.sourceReferences.some(ref=>ref.instrument===input.instrument&&ref.timeframe==="execution"&&Number.isFinite(time(ref.observedAt))&&Number.isFinite(time(ref.receivedAt))&&time(ref.observedAt)<=asOf&&time(ref.receivedAt)<=asOf))findings.push({code:"SOURCE_PROVENANCE_MISSING",message:"A timestamp-valid execution source reference matching the instrument is required."});
const seen=new Set<string>(), stages=new Map<ScalpingLatencyStage,number>();let previousSequence=-Infinity,previousTime=-Infinity;
for(const event of input.events){const t=time(event.timestamp);if(!Number.isFinite(t)||t>asOf){findings.push({code:"INVALID_TIMESTAMP",message:"An event timestamp is invalid or in the future."});continue;}
if(asOf-t>policy.maximumEventAgeSeconds*1000)findings.push({code:"STALE_EVENT",message:"An event exceeds the configured maximum age."});
if(event.instrument!==input.instrument||event.venueId!==input.venueId)findings.push({code:"IDENTITY_MISMATCH",message:"An event does not match the requested instrument and venue."});
if(!Number.isInteger(event.sequence)||event.sequence<=previousSequence||t<previousTime||seen.has(event.stage))findings.push({code:"INVALID_SEQUENCE",message:"Events must have unique stages and strictly increasing sequence numbers and timestamps."});
seen.add(event.stage);stages.set(event.stage,t);previousSequence=event.sequence;previousTime=t;}
const required:ScalpingLatencyStage[]=["QUOTE_RECEIVED","DECISION_RECORDED","ORDER_SUBMITTED","FILL_RECORDED"];
if(policy.requireAllStages&&required.some(s=>!stages.has(s)))findings.push({code:"MISSING_STAGE",message:"Policy requires quote, decision, submission and fill timestamps."});
const pairs=[["quoteToDecision","QUOTE_RECEIVED","DECISION_RECORDED"],["decisionToSubmit","DECISION_RECORDED","ORDER_SUBMITTED"],["submitToFill","ORDER_SUBMITTED","FILL_RECORDED"],["quoteToFill","QUOTE_RECEIVED","FILL_RECORDED"]] as const;
for(const [name,from,to] of pairs){const a=stages.get(from),b=stages.get(to);if(a!==undefined&&b!==undefined){if(b<a)findings.push({code:"NEGATIVE_INTERVAL",message:name+" interval is negative."});else assessment.observedIntervalsMilliseconds[name]=b-a;}}
if(findings.length)return result(input,findings,assessment,"INCOMPLETE");assessment.status="MEASURED";return result(input,[],assessment,"COMPLETE");
}