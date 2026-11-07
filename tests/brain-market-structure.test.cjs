/* eslint-disable @typescript-eslint/no-require-imports */
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const source=fs.readFileSync(path.join(process.cwd(),"src/lib/brain/market-structure.ts"),"utf8"),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports});
const {analyzeMarketStructure}=mod.exports;
function candles(values){return values.map((v,i)=>({timeUtc:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),open:v[0],high:v[1],low:v[2],close:v[3],closed:true}));}
const input=(rows)=>({instrument:"EURUSD",timeframe:"H1",candles:candles(rows),swingStrength:1,equalityTolerance:0.0002});
test("rejects forming candles rather than treating provisional structure as confirmed",()=>{const x=input([[1,2,0,1],[1,2,0,1],[1,2,0,1],[1,2,0,1],[1,2,0,1]]);x.candles[2].closed=false;assert.equal(analyzeMarketStructure(x).status,"INVALID_DATA");});
test("rejects out-of-order timestamps",()=>{const x=input([[1,2,0,1],[1,2,0,1],[1,2,0,1],[1,2,0,1],[1,2,0,1]]);x.candles[3].timeUtc=x.candles[1].timeUtc;assert.equal(analyzeMarketStructure(x).status,"INVALID_DATA");});
test("requires sufficient closed candle history",()=>{assert.equal(analyzeMarketStructure(input([[1,2,0,1],[1,2,0,1]])).status,"INSUFFICIENT_DATA");});
test("detects confirmed swing highs and lows",()=>{const r=analyzeMarketStructure(input([[5,6,4,5],[5,8,4,6],[5,6,3,4],[4,7,4,6],[5,6,2,4]]));assert.equal(r.status,"READY");assert.ok(r.swings.some(x=>x.kind==="HIGH"&&x.price===8));assert.ok(r.swings.some(x=>x.kind==="LOW"&&x.price===3));});
test("all events are explicitly closed-candle confirmed",()=>{const r=analyzeMarketStructure(input([[5,6,4,5],[5,8,4,6],[5,6,3,4],[4,7,4,6],[5,6,2,4]]));assert.ok(r.events.every(x=>x.confirmedByClosedCandle===true));});
test("does not generate trade signals",()=>{const r=analyzeMarketStructure(input([[5,6,4,5],[5,8,4,6],[5,6,3,4],[4,7,4,6],[5,6,2,4]]));assert.equal(r.tradeSignalGenerated,false);});
test("rejects invalid OHLC ranges",()=>{const x=input([[5,6,4,5],[5,8,4,6],[5,6,3,4],[4,7,4,6],[5,6,2,4]]);x.candles[2].high=1;assert.equal(analyzeMarketStructure(x).status,"INVALID_DATA");});
test("requires explicit positive equal-level tolerance",()=>{const x=input([[5,6,4,5],[5,8,4,6],[5,6,3,4],[4,7,4,6],[5,6,2,4]]);x.equalityTolerance=0;assert.equal(analyzeMarketStructure(x).status,"INVALID_DATA");});

test("does not use a swing before its right-side confirmation candle closes",()=>{const x=input([[5,6,4,5],[5,8,4,7],[7,9,6,8],[8,8.5,6,7],[7,7.5,5,6]]);const r=analyzeMarketStructure(x);assert.ok(!r.events.some(e=>e.candleIndex===2&&e.type==="BOS"));});
test("recognizes a close-through break of a previously confirmed swing high",()=>{const x=input([[5,6,4,5],[5,8,4,6],[5,6,3,4],[4,7,4,6],[5,6,2,4],[7,9.5,6,9],[8,9,7,8]]);const r=analyzeMarketStructure(x);assert.ok(r.events.some(e=>e.type==="BOS"&&e.direction==="BULLISH"&&e.candleIndex===5));});
test("recognizes a wick-through and close-back liquidity sweep",()=>{const x=input([[5,6,4,5],[5,8,4,6],[5,6,3,4],[4,7,4,6],[5,6,2,4],[7,9,6,6.5],[7,8,6,7]]);const r=analyzeMarketStructure(x);assert.ok(r.events.some(e=>e.type==="LIQUIDITY_SWEEP"&&e.direction==="BEARISH"&&e.candleIndex===5));});
