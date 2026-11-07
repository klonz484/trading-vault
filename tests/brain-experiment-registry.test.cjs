/* eslint-disable @typescript-eslint/no-require-imports */
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const source=fs.readFileSync(path.join(process.cwd(),"src/lib/brain/experiment-registry.ts"),"utf8"),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports});
const {evaluateExperiment}=mod.exports;
function base(overrides={}){return {experimentId:"exp-001",hypothesis:"The revised structure filter improves out-of-sample expectancy.",ownerApprovedProtocol:true,strategyVersion:"strategy-v2",brainVersion:"brain-v0.2",datasetHash:"0123456789abcdef0123456789abcdef",datasetVerified:true,trainStartUtc:"2025-01-01T00:00:00Z",trainEndUtc:"2025-06-30T23:59:59Z",testStartUtc:"2025-07-01T00:00:00Z",testEndUtc:"2025-12-31T23:59:59Z",sampleCount:250,minimumSampleCount:100,primaryMetric:{name:"expectancyR",direction:"HIGHER_IS_BETTER",baseline:0.12,candidate:0.18,minimumImprovement:0.03},guardrails:[{name:"maxDrawdownPct",direction:"LOWER_IS_BETTER",baseline:8,candidate:8.5,maximumDegradation:1}],...overrides};}
test("eligible experiment requires owner-approved protocol and out-of-sample evidence",()=>{const r=evaluateExperiment(base());assert.equal(r.status,"ELIGIBLE_FOR_OWNER_REVIEW");assert.equal(r.primaryMetric.improvement,0.06);});
test("never authorizes shared Brain changes or production activation",()=>{const r=evaluateExperiment(base());assert.equal(r.sharedBrainChangeAuthorized,false);assert.equal(r.productionActivationAuthorized,false);});
test("blocks unapproved protocol",()=>{assert.equal(evaluateExperiment(base({ownerApprovedProtocol:false})).status,"INCOMPLETE");});
test("blocks insufficient out-of-sample sample size",()=>{assert.equal(evaluateExperiment(base({sampleCount:99})).status,"INCOMPLETE");});
test("rejects overlapping train and test periods",()=>{assert.equal(evaluateExperiment(base({testStartUtc:"2025-06-01T00:00:00Z"})).status,"INVALID");});
test("rejects unverified or malformed dataset provenance",()=>{assert.equal(evaluateExperiment(base({datasetVerified:false})).status,"INVALID");assert.equal(evaluateExperiment(base({datasetHash:"not-a-hash"})).status,"INVALID");});
test("rejects a candidate that misses the primary metric threshold",()=>{const x=base();x.primaryMetric.candidate=0.13;assert.equal(evaluateExperiment(x).status,"REJECTED");});
test("rejects a guardrail degradation beyond its registered limit",()=>{const x=base();x.guardrails[0].candidate=10;assert.equal(evaluateExperiment(x).status,"REJECTED");});
test("handles lower-is-better primary metrics",()=>{const x=base();x.primaryMetric={name:"maxDrawdown",direction:"LOWER_IS_BETTER",baseline:10,candidate:8,minimumImprovement:1};assert.equal(evaluateExperiment(x).status,"ELIGIBLE_FOR_OWNER_REVIEW");});
test("handles higher-is-better guardrails without accepting excess decline",()=>{const x=base();x.guardrails=[{name:"winRate",direction:"HIGHER_IS_BETTER",baseline:55,candidate:52,maximumDegradation:2}];assert.equal(evaluateExperiment(x).status,"REJECTED");});
test("invalid metric definitions fail closed",()=>{const x=base();x.primaryMetric.minimumImprovement=-1;assert.equal(evaluateExperiment(x).status,"INVALID");});
test("missing hypothesis or version identity fails closed",()=>{const x=base();x.hypothesis="";assert.equal(evaluateExperiment(x).status,"INVALID");});

test("requires explicit UTC timestamps rather than local or offset-ambiguous dates",()=>{assert.equal(evaluateExperiment(base({trainStartUtc:"2025-01-01T00:00:00"})).status,"INVALID");assert.equal(evaluateExperiment(base({testEndUtc:"2025-12-31T23:59:59+02:00"})).status,"INVALID");});
test("requires guardrails to be a real array",()=>{assert.equal(evaluateExperiment(base({guardrails:null})).status,"INVALID");});

test("rejects impossible calendar dates in UTC boundaries",()=>{assert.equal(evaluateExperiment(base({trainStartUtc:"2025-02-30T00:00:00Z"})).status,"INVALID");assert.equal(evaluateExperiment(base({testEndUtc:"2025-13-01T00:00:00Z"})).status,"INVALID");});
test("accepts valid leap-day UTC boundaries",()=>{const x=base({trainStartUtc:"2024-02-29T00:00:00Z",trainEndUtc:"2024-06-30T23:59:59Z",testStartUtc:"2024-07-01T00:00:00Z",testEndUtc:"2024-12-31T23:59:59Z"});assert.equal(evaluateExperiment(x).status,"ELIGIBLE_FOR_OWNER_REVIEW");});
test("rejects null or malformed guardrail entries without throwing",()=>{assert.equal(evaluateExperiment(base({guardrails:[null]})).status,"INVALID");});
test("rejects duplicate guardrail names",()=>{const x=base();x.guardrails.push({...x.guardrails[0]});assert.equal(evaluateExperiment(x).status,"INVALID");});
