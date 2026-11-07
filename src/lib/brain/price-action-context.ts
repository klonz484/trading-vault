/**
 * Volatility, displacement and dealing-range context from closed OHLC candles.
 * Context only: this module does not create entries, targets or trade signals.
 */
export const PRICE_ACTION_CONTEXT_VERSION = "0.1.0" as const;
export type ContextCandle = { timeUtc:string; open:number; high:number; low:number; close:number; closed:true };
export type PriceActionContextInput = { instrument:string; timeframe:string; candles:ContextCandle[]; atrPeriod:number; rangeLookback:number; displacementAtrMultiple:number; closeExtremeFraction:number; maxRangeAtrWidth:number };
export type PriceActionContextResult = {
 engineVersion:typeof PRICE_ACTION_CONTEXT_VERSION; status:"READY"|"INSUFFICIENT_DATA"|"INVALID_DATA";
 instrument:string; timeframe:string; atr:number|null; atrPeriod:number;
 volatility:"LOW"|"NORMAL"|"EXPANDED"|"UNDETERMINED";
 range:{high:number;low:number;width:number;midpoint:number;detected:boolean}|null;
 displacement:Array<{index:number;timeUtc:string;direction:"BULLISH"|"BEARISH";body:number;bodyAtrMultiple:number;closeLocation:number}>;
 warnings:string[]; tradeSignalGenerated:false;
};
const finite=(n:number)=>Number.isFinite(n);
function trueRange(c:ContextCandle,previousClose:number):number{return Math.max(c.high-c.low,Math.abs(c.high-previousClose),Math.abs(c.low-previousClose));}
export function analyzePriceActionContext(input:PriceActionContextInput):PriceActionContextResult {
 const warnings:string[]=[];
 const invalid=(message:string)=>warnings.push(message);
 if(!input.instrument||!input.timeframe)invalid("Instrument and timeframe are required.");
 if(!Number.isInteger(input.atrPeriod)||input.atrPeriod<2)invalid("atrPeriod must be an integer of at least 2.");
 if(!Number.isInteger(input.rangeLookback)||input.rangeLookback<2)invalid("rangeLookback must be an integer of at least 2.");
 if(!finite(input.displacementAtrMultiple)||input.displacementAtrMultiple<=0)invalid("Displacement ATR multiple must be positive.");
 if(!finite(input.closeExtremeFraction)||input.closeExtremeFraction<=0.5||input.closeExtremeFraction>=1)invalid("closeExtremeFraction must be between 0.5 and 1.");
 if(!finite(input.maxRangeAtrWidth)||input.maxRangeAtrWidth<=0)invalid("maxRangeAtrWidth must be positive.");
 let previous=-Infinity;
 for(let i=0;i<input.candles.length;i++){const c=input.candles[i],t=Date.parse(c.timeUtc);if(c.closed!==true)invalid(`Candle ${i} is not confirmed closed.`);if(!Number.isFinite(t)||t<=previous)invalid(`Candle ${i} timestamp is invalid or not strictly increasing.`);previous=t;if(![c.open,c.high,c.low,c.close].every(finite)||c.high<c.low||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close))invalid(`Candle ${i} has invalid OHLC values.`);}
 const base={engineVersion:PRICE_ACTION_CONTEXT_VERSION,instrument:input.instrument,timeframe:input.timeframe,atrPeriod:input.atrPeriod,tradeSignalGenerated:false as const};
 if(warnings.length)return {...base,status:"INVALID_DATA",atr:null,volatility:"UNDETERMINED" as const,range:null,displacement:[],warnings};
 const required=Math.max(input.atrPeriod+1,input.rangeLookback+1);
 if(input.candles.length<required)return {...base,status:"INSUFFICIENT_DATA",atr:null,volatility:"UNDETERMINED" as const,range:null,displacement:[],warnings:[`At least ${required} closed candles are required.`]};
 const ranges=input.candles.slice(1).map((c,i)=>trueRange(c,input.candles[i].close));
 const atrValues=ranges.slice(-input.atrPeriod),atr=atrValues.reduce((a,b)=>a+b,0)/atrValues.length;
 if(!finite(atr)||atr<=0)return {...base,status:"INVALID_DATA",atr:null,volatility:"UNDETERMINED" as const,range:null,displacement:[],warnings:["ATR could not be calculated from the supplied candles."]};
 const recent=input.candles.slice(-input.rangeLookback),high=Math.max(...recent.map(c=>c.high)),low=Math.min(...recent.map(c=>c.low)),width=high-low;
 const rangeDetected=width/atr<=input.maxRangeAtrWidth;
 const displacement=input.candles.slice(1).map((c,i)=>({c,index:i+1,body:Math.abs(c.close-c.open),atrAtCandle:ranges[i]})).filter(x=>{
  const location=(x.c.close-x.c.low)/(x.c.high-x.c.low||1);
  return x.body>=x.atrAtCandle*input.displacementAtrMultiple&&(x.c.close>x.c.open?location>=input.closeExtremeFraction:location<=1-input.closeExtremeFraction);
 }).map(x=>({index:x.index,timeUtc:x.c.timeUtc,direction:x.c.close>x.c.open?"BULLISH" as const:"BEARISH" as const,body:x.body,bodyAtrMultiple:x.body/x.atrAtCandle,closeLocation:(x.c.close-x.c.low)/(x.c.high-x.c.low||1)}));
 const baseline=ranges.slice(-Math.min(ranges.length,input.atrPeriod*3),-input.atrPeriod);
 const baselineAtr=baseline.length?baseline.reduce((a,b)=>a+b,0)/baseline.length:atr;
 const volatility=atr<baselineAtr*0.75?"LOW":atr>baselineAtr*1.5?"EXPANDED":"NORMAL";
 return {...base,status:"READY",atr,volatility,range:{high,low,width,midpoint:(high+low)/2,detected:rangeDetected},displacement,warnings:[]};
}
