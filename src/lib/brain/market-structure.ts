/**
 * Closed-candle market structure and liquidity primitives.
 * This module classifies supplied OHLC evidence; it does not emit trade entries.
 */
export const STRUCTURE_ENGINE_VERSION = "0.1.0" as const;
export type Candle = { timeUtc:string; open:number; high:number; low:number; close:number; closed:true };
export type SwingPoint = { index:number; timeUtc:string; price:number; kind:"HIGH"|"LOW" };
export type StructureEvent = { type:"BOS"|"CHOCH"|"MSS"|"LIQUIDITY_SWEEP"; direction:"BULLISH"|"BEARISH"; level:number; candleIndex:number; timeUtc:string; confirmedByClosedCandle:true; explanation:string };
export type LiquidityPool = { kind:"EQUAL_HIGHS"|"EQUAL_LOWS"; price:number; touches:number[]; tolerance:number };
export type StructureInput = { instrument:string; timeframe:string; candles:Candle[]; swingStrength:number; equalityTolerance:number };
export type StructureResult = { engineVersion:typeof STRUCTURE_ENGINE_VERSION; status:"READY"|"INSUFFICIENT_DATA"|"INVALID_DATA"; instrument:string; timeframe:string; trend:"BULLISH"|"BEARISH"|"RANGE"|"UNDETERMINED"; swings:SwingPoint[]; events:StructureEvent[]; liquidityPools:LiquidityPool[]; latestClosedCandleTimeUtc:string|null; warnings:string[]; tradeSignalGenerated:false };

const finite=(n:number)=>Number.isFinite(n);
function validate(input:StructureInput):string[] {
 const errors:string[]=[];
 if(!input.instrument||!input.timeframe)errors.push("Instrument and timeframe are required.");
 if(!Number.isInteger(input.swingStrength)||input.swingStrength<1||input.swingStrength>10)errors.push("swingStrength must be an integer from 1 to 10.");
 if(!finite(input.equalityTolerance)||input.equalityTolerance<=0)errors.push("An explicit positive price equality tolerance is required.");
 let previous=-Infinity;
 for(let i=0;i<input.candles.length;i++){
  const c=input.candles[i],t=Date.parse(c.timeUtc);
  if(c.closed!==true)errors.push(`Candle ${i} is not confirmed closed.`);
  if(!Number.isFinite(t)||t<=previous)errors.push(`Candle ${i} timestamp is invalid or not strictly increasing.`);
  previous=t;
  if(![c.open,c.high,c.low,c.close].every(finite)||c.high<c.low||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close))errors.push(`Candle ${i} has invalid OHLC values.`);
 }
 return errors;
}
function isSwingHigh(c:Candle[],i:number,s:number):boolean {
 for(let k=i-s;k<=i+s;k++){if(k===i)continue;if(c[k].high>=c[i].high)return false;}return true;
}
function isSwingLow(c:Candle[],i:number,s:number):boolean {
 for(let k=i-s;k<=i+s;k++){if(k===i)continue;if(c[k].low<=c[i].low)return false;}return true;
}
export function analyzeMarketStructure(input:StructureInput):StructureResult {
 const invalid=validate(input),base={engineVersion:STRUCTURE_ENGINE_VERSION,instrument:input.instrument,timeframe:input.timeframe,latestClosedCandleTimeUtc:input.candles.at(-1)?.timeUtc??null,tradeSignalGenerated:false as const};
 if(invalid.length)return {...base,status:"INVALID_DATA",trend:"UNDETERMINED",swings:[],events:[],liquidityPools:[],warnings:invalid};
 const candles=input.candles,s=input.swingStrength;
 if(candles.length<2*s+3)return {...base,status:"INSUFFICIENT_DATA",trend:"UNDETERMINED",swings:[],events:[],liquidityPools:[],warnings:[`At least ${2*s+3} closed candles are required for this swing strength.`]};
 const swings:SwingPoint[]=[];
 for(let i=s;i<candles.length-s;i++){
  if(isSwingHigh(candles,i,s))swings.push({index:i,timeUtc:candles[i].timeUtc,price:candles[i].high,kind:"HIGH"});
  if(isSwingLow(candles,i,s))swings.push({index:i,timeUtc:candles[i].timeUtc,price:candles[i].low,kind:"LOW"});
 }
 const events:StructureEvent[]=[];
 let trend:"BULLISH"|"BEARISH"|"RANGE"|"UNDETERMINED"="UNDETERMINED";
 const highs=swings.filter(x=>x.kind==="HIGH"),lows=swings.filter(x=>x.kind==="LOW");
 if(highs.length>=2&&lows.length>=2){
  const h1=highs.at(-2)!,h2=highs.at(-1)!,l1=lows.at(-2)!,l2=lows.at(-1)!;
  if(h2.price>h1.price&&l2.price>l1.price)trend="BULLISH";
  else if(h2.price<h1.price&&l2.price<l1.price)trend="BEARISH";
  else trend="RANGE";
 }
 let brokenHigh:number|null=null,brokenLow:number|null=null;
 for(let i=0;i<candles.length;i++){
  const priorHigh=highs.filter(x=>x.index<i).at(-1),priorLow=lows.filter(x=>x.index<i).at(-1);
  const c=candles[i];
  if(priorHigh&&c.close>priorHigh.price&&brokenHigh!==priorHigh.price){
   const reversal=trend==="BEARISH";
   events.push({type:reversal?"CHOCH":"BOS",direction:"BULLISH",level:priorHigh.price,candleIndex:i,timeUtc:c.timeUtc,confirmedByClosedCandle:true,explanation:`Closed candle ${i} closed above confirmed swing high ${priorHigh.price}.`});
   if(reversal)events.push({type:"MSS",direction:"BULLISH",level:priorHigh.price,candleIndex:i,timeUtc:c.timeUtc,confirmedByClosedCandle:true,explanation:"Bullish market-structure shift after bearish sequence."});
   brokenHigh=priorHigh.price;trend="BULLISH";
  }
  if(priorLow&&c.close<priorLow.price&&brokenLow!==priorLow.price){
   const reversal=trend==="BULLISH";
   events.push({type:reversal?"CHOCH":"BOS",direction:"BEARISH",level:priorLow.price,candleIndex:i,timeUtc:c.timeUtc,confirmedByClosedCandle:true,explanation:`Closed candle ${i} closed below confirmed swing low ${priorLow.price}.`});
   if(reversal)events.push({type:"MSS",direction:"BEARISH",level:priorLow.price,candleIndex:i,timeUtc:c.timeUtc,confirmedByClosedCandle:true,explanation:"Bearish market-structure shift after bullish sequence."});
   brokenLow=priorLow.price;trend="BEARISH";
  }
  if(priorHigh&&c.high>priorHigh.price&&c.close<priorHigh.price)events.push({type:"LIQUIDITY_SWEEP",direction:"BEARISH",level:priorHigh.price,candleIndex:i,timeUtc:c.timeUtc,confirmedByClosedCandle:true,explanation:"Wick traded above a confirmed swing high and the candle closed back below it."});
  if(priorLow&&c.low<priorLow.price&&c.close>priorLow.price)events.push({type:"LIQUIDITY_SWEEP",direction:"BULLISH",level:priorLow.price,candleIndex:i,timeUtc:c.timeUtc,confirmedByClosedCandle:true,explanation:"Wick traded below a confirmed swing low and the candle closed back above it."});
 }
 const pools:LiquidityPool[]=[];
 for(const kind of ["HIGH","LOW"] as const){
  const points=swings.filter(x=>x.kind===kind),used=new Set<number>();
  for(let i=0;i<points.length;i++){
   if(used.has(i))continue;
   const matches=[i];
   for(let j=i+1;j<points.length;j++)if(Math.abs(points[j].price-points[i].price)<=input.equalityTolerance)matches.push(j);
   if(matches.length>=2){matches.forEach(x=>used.add(x));const values=matches.map(x=>points[x].price).sort((a,b)=>a-b);pools.push({kind:kind==="HIGH"?"EQUAL_HIGHS":"EQUAL_LOWS",price:values[Math.floor(values.length/2)],touches:matches.map(x=>points[x].index),tolerance:input.equalityTolerance});}
  }
 }
 return {...base,status:"READY",trend,swings,events,liquidityPools:pools,warnings:[]};
}
