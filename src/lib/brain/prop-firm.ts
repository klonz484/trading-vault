/** Prop-firm compliance gate. Unknown firm/account rules never default to PASS. */
export const PROP_RULE_ENGINE_VERSION = "0.1.0" as const;
export type PropFirmProfile = { verified:boolean; firmName:string|null; dailyLossLimitPct:number|null; overallLossLimitPct:number|null; trailingDrawdown:boolean|null; maxOpenPositions:number|null; newsTradingAllowed:boolean|null; consistencyRulePct:number|null; minimumTradingDays:number|null; profitTargetPct:number|null };
export type PropAccountSnapshot = { verified:boolean; equity:number|null; startOfDayEquity:number|null; highWatermarkEquity:number|null; currentOpenPositions:number|null; todayNetPnl:number|null; totalNetPnl:number|null; tradingDaysCompleted:number|null; bestDayProfit:number|null; totalProfit:number|null; newsWindowActive:boolean|null };
export type ProposedRisk = { verified:boolean; cashRisk:number|null; additionalOpenPositions:number|null };
export type PropRuleResult = { engineVersion:typeof PROP_RULE_ENGINE_VERSION; overall:"PASS"|"BLOCK"|"REVIEW"; checks:Array<{rule:string;status:"PASS"|"BLOCK"|"REVIEW";detail:string}> };
export function evaluatePropFirmRules(profile:PropFirmProfile,account:PropAccountSnapshot,proposed:ProposedRisk):PropRuleResult {
 const checks:PropRuleResult["checks"]=[], add=(rule:string,status:"PASS"|"BLOCK"|"REVIEW",detail:string)=>checks.push({rule,status,detail});
 const n=(v:number|null):v is number=>typeof v==="number"&&Number.isFinite(v);
 if(!profile.verified||!account.verified||!proposed.verified)add("verification","REVIEW","Firm rules, account snapshot and proposed risk must all be verified.");
 else add("verification","PASS","Firm rules, account snapshot and proposed risk are verified.");
 for(const key of ["dailyLossLimitPct","overallLossLimitPct","maxOpenPositions","newsTradingAllowed"] as const)if(profile[key]===null)add(key,"REVIEW","Exact firm rule is unknown; do not assume compliance.");
 for(const key of ["equity","startOfDayEquity","highWatermarkEquity","currentOpenPositions","todayNetPnl","newsWindowActive"] as const)if(account[key]===null)add(key,"REVIEW","Account state is unknown; do not assume compliance.");
 if(n(profile.dailyLossLimitPct)&&n(account.startOfDayEquity)&&n(account.todayNetPnl)&&n(proposed.cashRisk)){const loss=Math.max(0,-account.todayNetPnl)+Math.max(0,proposed.cashRisk),limit=account.startOfDayEquity*profile.dailyLossLimitPct/100;add("daily_drawdown",loss<limit?"PASS":"BLOCK",`Projected daily loss ${loss.toFixed(2)} against limit ${limit.toFixed(2)}.`);}
 if(n(profile.overallLossLimitPct)&&n(account.highWatermarkEquity)&&n(account.equity)&&n(proposed.cashRisk)){const loss=account.highWatermarkEquity-(account.equity-proposed.cashRisk),limit=account.highWatermarkEquity*profile.overallLossLimitPct/100;add("overall_drawdown",loss<limit?"PASS":"BLOCK",`Projected drawdown ${loss.toFixed(2)} against limit ${limit.toFixed(2)}.`);}
 if(n(profile.maxOpenPositions)&&n(account.currentOpenPositions)&&n(proposed.additionalOpenPositions)){const total=account.currentOpenPositions+proposed.additionalOpenPositions;add("position_limit",total<=profile.maxOpenPositions?"PASS":"BLOCK",`Projected open positions ${total} against limit ${profile.maxOpenPositions}.`);}
 if(typeof profile.newsTradingAllowed==="boolean"&&typeof account.newsWindowActive==="boolean")add("news_restriction",profile.newsTradingAllowed||!account.newsWindowActive?"PASS":"BLOCK",profile.newsTradingAllowed?"Firm permits news trading.":account.newsWindowActive?"Active restricted news window.":"No restricted news window is active.");
 if(profile.trailingDrawdown===null)add("trailing_drawdown","REVIEW","Trailing-drawdown treatment is unknown.");
 if(profile.consistencyRulePct===null)add("consistency","REVIEW","Consistency rule is unknown or not verified.");
 if(profile.minimumTradingDays===null||account.tradingDaysCompleted===null)add("minimum_days","REVIEW","Minimum trading-day requirement or progress is unknown.");
 if(profile.profitTargetPct===null||account.totalProfit===null||account.bestDayProfit===null)add("challenge_pacing","REVIEW","Profit target or daily profit distribution is unknown; pacing cannot be assessed.");
 if(!n(proposed.cashRisk)||proposed.cashRisk<=0||!n(proposed.additionalOpenPositions)||proposed.additionalOpenPositions<0)add("proposed_risk","BLOCK","Proposed cash risk and position count must be valid; cash risk must be above zero.");
 const overall=checks.some(x=>x.status==="BLOCK")?"BLOCK":checks.some(x=>x.status==="REVIEW")?"REVIEW":"PASS";
 return {engineVersion:PROP_RULE_ENGINE_VERSION,overall,checks};
}
