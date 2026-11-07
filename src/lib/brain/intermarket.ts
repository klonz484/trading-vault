/**
 * Intermarket relationship evidence from explicitly aligned closed-candle returns.
 * Correlation is descriptive, not causal, and never creates a trade signal.
 */
export const INTERMARKET_VERSION = "0.1.0" as const;
export type ReturnPoint = { closeTimeUtc: string; value: number; closed: true };
export type IntermarketSeries = {
  instrument: string;
  timeframe: string;
  sourceId: string;
  status: "READY" | "INSUFFICIENT_DATA" | "INVALID_DATA";
  latestClosedCandleTimeUtc: string;
  maxAgeMs: number;
  returns: ReturnPoint[];
};
export type IntermarketInput = {
  target: IntermarketSeries;
  comparator: IntermarketSeries;
  asOfUtc: string;
  minimumSamples: number;
  timestampToleranceMs: number;
  minimumAbsoluteCorrelation: number;
  expectedRelationship: "POSITIVE" | "NEGATIVE" | "ANY";
};
export type IntermarketResult = {
  engineVersion: typeof INTERMARKET_VERSION;
  status: "READY" | "CONFLICTING" | "STALE" | "INCOMPLETE" | "INVALID";
  targetInstrument: string;
  comparatorInstrument: string;
  timeframe: string;
  correlation: number | null;
  matchedSamples: number;
  relationship: "POSITIVE" | "NEGATIVE" | "WEAK" | "UNDETERMINED";
  expectedRelationship: IntermarketInput["expectedRelationship"];
  sourceIds: string[];
  warnings: string[];
  tradeSignalGenerated: false;
};
const finite=(n:number)=>Number.isFinite(n);
function validateSeries(s:IntermarketSeries,label:string,errors:string[]):void{
 if(!s.instrument?.trim()||!s.timeframe?.trim()||!s.sourceId?.trim())errors.push(`${label} instrument, timeframe and sourceId are required.`);
 if(s.status==="INVALID_DATA")errors.push(`${label} source series is invalid.`);
 if(!["READY","INSUFFICIENT_DATA","INVALID_DATA"].includes(s.status))errors.push(`${label} status is unsupported.`);
 if(!finite(s.maxAgeMs)||s.maxAgeMs<0)errors.push(`${label} maxAgeMs must be non-negative.`);
 let previous=-Infinity;
 for(const p of s.returns){
  const t=Date.parse(p.closeTimeUtc);
  if(p.closed!==true||!Number.isFinite(t)||t<=previous||!finite(p.value))errors.push(`${label} contains an unclosed, invalid, duplicated or unordered return observation.`);
  previous=t;
 }
}
function pearson(a:number[],b:number[]):number|null{
 const n=a.length,ma=a.reduce((x,y)=>x+y,0)/n,mb=b.reduce((x,y)=>x+y,0)/n;
 let numerator=0,da=0,db=0;
 for(let i=0;i<n;i++){const x=a[i]-ma,y=b[i]-mb;numerator+=x*y;da+=x*x;db+=y*y;}
 const denominator=Math.sqrt(da*db);
 return denominator>0?numerator/denominator:null;
}
export function analyzeIntermarketRelationship(input:IntermarketInput):IntermarketResult{
 const errors:string[]=[];
 validateSeries(input.target,"Target",errors);validateSeries(input.comparator,"Comparator",errors);
 const asOf=Date.parse(input.asOfUtc);
 if(!Number.isFinite(asOf))errors.push("asOfUtc must be a valid timestamp.");
 if(input.target.instrument===input.comparator.instrument)errors.push("Target and comparator instruments must be different.");
 if(input.target.timeframe!==input.comparator.timeframe)errors.push("Target and comparator timeframes must match.");
 if(!Number.isInteger(input.minimumSamples)||input.minimumSamples<3)errors.push("minimumSamples must be an integer of at least 3.");
 if(!finite(input.timestampToleranceMs)||input.timestampToleranceMs<0)errors.push("timestampToleranceMs must be non-negative.");
 if(!finite(input.minimumAbsoluteCorrelation)||input.minimumAbsoluteCorrelation<=0||input.minimumAbsoluteCorrelation>1)errors.push("minimumAbsoluteCorrelation must be greater than 0 and no more than 1.");
 if(!["POSITIVE","NEGATIVE","ANY"].includes(input.expectedRelationship))errors.push("expectedRelationship is invalid.");
 const base={engineVersion:INTERMARKET_VERSION,targetInstrument:input.target.instrument,comparatorInstrument:input.comparator.instrument,timeframe:input.target.timeframe,matchedSamples:0,expectedRelationship:input.expectedRelationship,sourceIds:[input.target.sourceId,input.comparator.sourceId],tradeSignalGenerated:false as const};
 if(errors.length)return {...base,status:"INVALID",correlation:null,relationship:"UNDETERMINED",warnings:errors};
 if(input.target.status!=="READY"||input.comparator.status!=="READY")return {...base,status:"INCOMPLETE",correlation:null,relationship:"UNDETERMINED",warnings:["Both target and comparator series must be READY."]};
 const targetTime=Date.parse(input.target.latestClosedCandleTimeUtc),comparatorTime=Date.parse(input.comparator.latestClosedCandleTimeUtc);
 const targetAge=asOf-targetTime,comparatorAge=asOf-comparatorTime;
 if(!Number.isFinite(targetTime)||!Number.isFinite(comparatorTime)||targetAge<0||comparatorAge<0)return {...base,status:"INVALID",correlation:null,relationship:"UNDETERMINED",warnings:["Latest closed-candle timestamps must be valid and not later than asOfUtc."]};
 if(targetAge>input.target.maxAgeMs||comparatorAge>input.comparator.maxAgeMs)return {...base,status:"STALE",correlation:null,relationship:"UNDETERMINED",warnings:["At least one intermarket series exceeds its explicit freshness limit."]};
 const targetByTime=new Map(input.target.returns.map(p=>[Date.parse(p.closeTimeUtc),p.value]));
 const comparatorByTime=new Map(input.comparator.returns.map(p=>[Date.parse(p.closeTimeUtc),p.value]));
 const targetValues:number[]=[],comparatorValues:number[]=[];
 for(const [time,value] of targetByTime){
  const match=[...comparatorByTime.entries()].find(([otherTime])=>Math.abs(otherTime-time)<=input.timestampToleranceMs);
  if(match){targetValues.push(value);comparatorValues.push(match[1]);comparatorByTime.delete(match[0]);}
 }
 if(targetValues.length<input.minimumSamples)return {...base,status:"INCOMPLETE",correlation:null,relationship:"UNDETERMINED",matchedSamples:targetValues.length,warnings:[`Only ${targetValues.length} timestamp-aligned samples; ${input.minimumSamples} required.`]};
 const correlation=pearson(targetValues,comparatorValues);
 if(correlation===null)return {...base,status:"INCOMPLETE",correlation:null,relationship:"UNDETERMINED",matchedSamples:targetValues.length,warnings:["Correlation is undefined because at least one return series has zero variance."]};
 const relationship=Math.abs(correlation)<input.minimumAbsoluteCorrelation?"WEAK":correlation>0?"POSITIVE":"NEGATIVE";
 if(input.expectedRelationship!=="ANY"&&relationship!=="WEAK"&&relationship!==input.expectedRelationship)return {...base,status:"CONFLICTING",correlation,relationship,matchedSamples:targetValues.length,warnings:["Observed relationship conflicts with the caller's pre-registered expected relationship."]};
 const warnings=input.target.sourceId!==input.comparator.sourceId?["Series use different source identifiers; verify comparable price construction and timestamps."]:[];
 return {...base,status:"READY",correlation,relationship,matchedSamples:targetValues.length,warnings};
}
