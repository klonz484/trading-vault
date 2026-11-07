/* eslint-disable @typescript-eslint/no-require-imports */
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const source=fs.readFileSync(path.join(process.cwd(),"src/lib/brain/intermarket.ts"),"utf8"),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports});
const {analyzeIntermarketRelationship}=mod.exports;
function series(instrument,values,sourceId="source-a"){return {instrument,timeframe:"H1",sourceId,status:"READY",latestClosedCandleTimeUtc:"2026-11-07T12:00:00Z",maxAgeMs:300000,returns:values.map((value,i)=>({closeTimeUtc:new Date(Date.UTC(2026,10,7,8+i)).toISOString(),value,closed:true}))};}
function input(a=[1,2,3,4,5],b=[2,4,6,8,10],extra={}){return {target:series("EURUSD",a),comparator:series("DXY",b,"source-b"),asOfUtc:"2026-11-07T12:01:00Z",minimumSamples:3,timestampToleranceMs:1000,minimumAbsoluteCorrelation:0.6,expectedRelationship:"POSITIVE",...extra};}
test("detects positive aligned intermarket relationship",()=>{const r=analyzeIntermarketRelationship(input());assert.equal(r.status,"READY");assert.equal(r.relationship,"POSITIVE");assert.ok(r.correlation>0.99);assert.equal(r.matchedSamples,5);});
test("detects negative relationship without inferring causation",()=>{const r=analyzeIntermarketRelationship(input([1,2,3,4,5],[-2,-4,-6,-8,-10],{expectedRelationship:"NEGATIVE"}));assert.equal(r.status,"READY");assert.equal(r.relationship,"NEGATIVE");});
test("preserves conflict with pre-registered expected relationship",()=>{const r=analyzeIntermarketRelationship(input([1,2,3,4,5],[-2,-4,-6,-8,-10]));assert.equal(r.status,"CONFLICTING");});
test("classifies weak correlation below explicit threshold",()=>{const r=analyzeIntermarketRelationship(input([1,2,3,4,5],[1,-1,1,-1,1],{expectedRelationship:"ANY",minimumAbsoluteCorrelation:0.8}));assert.equal(r.relationship,"WEAK");});
test("requires timestamp-aligned minimum sample count",()=>{const x=input();x.comparator.returns=x.comparator.returns.slice(0,2);const r=analyzeIntermarketRelationship(x);assert.equal(r.status,"INCOMPLETE");});
test("blocks stale comparator data",()=>{const x=input();x.comparator.latestClosedCandleTimeUtc="2026-11-07T11:00:00Z";const r=analyzeIntermarketRelationship(x);assert.equal(r.status,"STALE");});
test("rejects timeframe mismatch",()=>{const x=input();x.comparator.timeframe="M15";assert.equal(analyzeIntermarketRelationship(x).status,"INVALID");});
test("rejects forming candle return observations",()=>{const x=input();x.target.returns[2].closed=false;assert.equal(analyzeIntermarketRelationship(x).status,"INVALID");});
test("returns incomplete when either series has zero variance",()=>{const r=analyzeIntermarketRelationship(input([1,1,1,1,1],[2,3,4,5,6],{expectedRelationship:"ANY"}));assert.equal(r.status,"INCOMPLETE");});
test("never generates a trade signal",()=>{assert.equal(analyzeIntermarketRelationship(input()).tradeSignalGenerated,false);});
