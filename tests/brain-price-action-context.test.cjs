/* eslint-disable @typescript-eslint/no-require-imports */
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const source=fs.readFileSync(path.join(process.cwd(),"src/lib/brain/price-action-context.ts"),"utf8"),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports});
const {analyzePriceActionContext}=mod.exports;
function candles(rows){return rows.map((v,i)=>({timeUtc:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),open:v[0],high:v[1],low:v[2],close:v[3],closed:true}));}
function input(rows){return {instrument:"XAUUSD",timeframe:"M15",candles:candles(rows),atrPeriod:3,rangeLookback:3,displacementAtrMultiple:1.5,closeExtremeFraction:0.75,maxRangeAtrWidth:4};}
test("rejects any forming candle",()=>{const x=input([[10,11,9,10],[10,11,9,10],[10,11,9,10],[10,11,9,10]]);x.candles[2].closed=false;assert.equal(analyzePriceActionContext(x).status,"INVALID_DATA");});
test("rejects invalid OHLC geometry",()=>{const x=input([[10,11,9,10],[10,11,9,10],[10,11,9,10],[10,11,9,10]]);x.candles[1].low=12;assert.equal(analyzePriceActionContext(x).status,"INVALID_DATA");});
test("requires sufficient candle history",()=>{assert.equal(analyzePriceActionContext(input([[10,11,9,10],[10,11,9,10]])).status,"INSUFFICIENT_DATA");});
test("calculates ATR and a dealing range from closed candles",()=>{const r=analyzePriceActionContext(input([[10,11,9,10],[10,12,9,11],[11,12,10,11],[11,12,10,11]]));assert.equal(r.status,"READY");assert.ok(r.atr>0);assert.ok(r.range.high>=r.range.low);});
test("detects a strong bullish displacement candle",()=>{const r=analyzePriceActionContext(input([[10,11,9,10],[10,11,9,10],[10,11,9,10],[10,15,10,14.8]]));assert.ok(r.displacement.some(x=>x.direction==="BULLISH"&&x.index===3));});
test("detects a strong bearish displacement candle",()=>{const r=analyzePriceActionContext(input([[10,11,9,10],[10,11,9,10],[10,11,9,10],[10,10,5,5.2]]));assert.ok(r.displacement.some(x=>x.direction==="BEARISH"&&x.index===3));});
test("does not emit a trading signal",()=>{const r=analyzePriceActionContext(input([[10,11,9,10],[10,11,9,10],[10,11,9,10],[10,15,10,14.8]]));assert.equal(r.tradeSignalGenerated,false);});
