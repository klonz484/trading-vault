/** Prop-firm compliance gate. Unknown firm/account rules never default to PASS. */
export const PROP_RULE_ENGINE_VERSION = "0.2.0" as const;
export type PropFirmProfile = {
 verified:boolean; firmName:string|null; dailyLossLimitPct:number|null; overallLossLimitPct:number|null;
 trailingDrawdown:boolean|null; maxOpenPositions:number|null; newsTradingAllowed:boolean|null;
 consistencyRulePct:number|null; minimumTradingDays:number|null; profitTargetPct:number|null
};
export type PropAccountSnapshot = {
 verified:boolean; equity:number|null; initialBalance:number|null; startOfDayEquity:number|null;
 highWatermarkEquity:number|null; currentOpenPositions:number|null; todayNetPnl:number|null;
 totalNetPnl:number|null; tradingDaysCompleted:number|null; bestDayProfit:number|null;
 totalProfit:number|null; newsWindowActive:boolean|null
};
export type ProposedRisk = { verified:boolean; cashRisk:number|null; additionalOpenPositions:number|null };
export type PropRuleResult = {
 engineVersion:typeof PROP_RULE_ENGINE_VERSION; overall:"PASS"|"BLOCK"|"REVIEW";
 checks:Array<{rule:string;status:"PASS"|"BLOCK"|"REVIEW";detail:string}>
};
export function evaluatePropFirmRules(profile:PropFirmProfile,account:PropAccountSnapshot,proposed:ProposedRisk):PropRuleResult {
 const checks:PropRuleResult["checks"]=[],add=(rule:string,status:"PASS"|"BLOCK"|"REVIEW",detail:string)=>checks.push({rule,status,detail});
 const n=(v:number|null|undefined):v is number=>typeof v==="number"&&Number.isFinite(v);
 if(!profile.verified||!account.verified||!proposed.verified)add("verification","REVIEW","Firm rules, account snapshot and proposed risk must all be verified.");
 else add("verification","PASS","Firm rules, account snapshot and proposed risk are verified.");
 for(const key of ["dailyLossLimitPct","overallLossLimitPct","maxOpenPositions","newsTradingAllowed"] as const)if(profile[key]===null)add(key,"REVIEW","Exact firm rule is unknown; do not assume compliance.");
 for(const key of ["equity","startOfDayEquity","currentOpenPositions","todayNetPnl","newsWindowActive"] as const)if(account[key]===null)add(key,"REVIEW","Account state is unknown; do not assume compliance.");
 for(const key of ["equity","initialBalance","startOfDayEquity","highWatermarkEquity","todayNetPnl","totalNetPnl","bestDayProfit","totalProfit"] as const)if(account[key]!==null&&(!n(account[key])||(key!=="todayNetPnl"&&key!=="totalNetPnl"&&account[key]!<0)))add(`${key}_validation`,"REVIEW",`Account field ${key} is invalid; a verified non-negative finite value is required.`);
 if(account.currentOpenPositions!==null&&(!Number.isInteger(account.currentOpenPositions)||account.currentOpenPositions<0))add("current_positions_validation","REVIEW","Current open-position count must be a non-negative integer.");
 if(account.tradingDaysCompleted!==null&&(!Number.isInteger(account.tradingDaysCompleted)||account.tradingDaysCompleted<0))add("completed_days_validation","REVIEW","Completed trading days must be a non-negative integer.");
 if(profile.dailyLossLimitPct!==null&&(!n(profile.dailyLossLimitPct)||profile.dailyLossLimitPct<=0||profile.dailyLossLimitPct>100))add("daily_rule_validation","BLOCK","Daily loss limit percentage must be greater than 0 and no more than 100.");
 if(profile.overallLossLimitPct!==null&&(!n(profile.overallLossLimitPct)||profile.overallLossLimitPct<=0||profile.overallLossLimitPct>100))add("overall_rule_validation","BLOCK","Overall loss limit percentage must be greater than 0 and no more than 100.");
 if(profile.maxOpenPositions!==null&&(!Number.isInteger(profile.maxOpenPositions)||profile.maxOpenPositions<1))add("position_rule_validation","BLOCK","Maximum open positions must be a positive integer.");
 if(n(profile.dailyLossLimitPct)&&profile.dailyLossLimitPct>0&&profile.dailyLossLimitPct<=100&&n(account.startOfDayEquity)&&account.startOfDayEquity>0&&n(account.todayNetPnl)&&n(proposed.cashRisk)&&proposed.cashRisk>=0){
  const projectedLoss=Math.max(0,proposed.cashRisk-account.todayNetPnl),limit=account.startOfDayEquity*profile.dailyLossLimitPct/100;
  add("daily_drawdown",projectedLoss<limit?"PASS":"BLOCK",`Projected daily loss ${projectedLoss.toFixed(2)} against limit ${limit.toFixed(2)} based on verified start-of-day equity.`);
 }
 if(n(profile.overallLossLimitPct)&&profile.overallLossLimitPct>0&&profile.overallLossLimitPct<=100&&n(account.equity)&&account.equity>0&&n(proposed.cashRisk)&&proposed.cashRisk>=0){
  const reference=profile.trailingDrawdown===true?account.highWatermarkEquity:profile.trailingDrawdown===false?account.initialBalance:null;
  const referenceLabel=profile.trailingDrawdown===true?"verified high-watermark equity":profile.trailingDrawdown===false?"verified initial balance":"configured drawdown reference";
  if(profile.trailingDrawdown===null)add("trailing_drawdown","REVIEW","Firm drawdown mode is unknown; static versus trailing reference cannot be selected.");
  else if(!n(reference)||reference<=0)add("overall_drawdown","REVIEW",`A verified positive ${referenceLabel} is required.`);
  else{
   const projectedEquity=account.equity-proposed.cashRisk,projectedDrawdown=Math.max(0,reference-projectedEquity),limit=reference*profile.overallLossLimitPct/100;
   add("overall_drawdown",projectedDrawdown<limit?"PASS":"BLOCK",`Projected drawdown ${projectedDrawdown.toFixed(2)} against limit ${limit.toFixed(2)} using ${referenceLabel}.`);
  }
 } else if(profile.trailingDrawdown===null)add("trailing_drawdown","REVIEW","Firm drawdown mode is unknown; static versus trailing reference cannot be selected.");
 if(n(profile.maxOpenPositions)&&Number.isInteger(profile.maxOpenPositions)&&profile.maxOpenPositions>0&&n(account.currentOpenPositions)&&Number.isInteger(account.currentOpenPositions)&&n(proposed.additionalOpenPositions)&&Number.isInteger(proposed.additionalOpenPositions)&&proposed.additionalOpenPositions>=0){
  const total=account.currentOpenPositions+proposed.additionalOpenPositions;
  add("position_limit",total<=profile.maxOpenPositions?"PASS":"BLOCK",`Projected open positions ${total} against limit ${profile.maxOpenPositions}.`);
 }
 if(typeof profile.newsTradingAllowed==="boolean"&&typeof account.newsWindowActive==="boolean")add("news_restriction",profile.newsTradingAllowed||!account.newsWindowActive?"PASS":"BLOCK",profile.newsTradingAllowed?"Firm permits news trading.":account.newsWindowActive?"Active restricted news window.":"No restricted news window is active.");
 if(profile.consistencyRulePct===null)add("consistency","REVIEW","Consistency rule is unknown or not verified.");
 else if(!n(profile.consistencyRulePct)||profile.consistencyRulePct<=0||profile.consistencyRulePct>100)add("consistency_rule_validation","BLOCK","Consistency percentage must be greater than 0 and no more than 100.");
 else if(!n(account.bestDayProfit)||account.bestDayProfit<0||!n(account.totalProfit)||account.totalProfit<=0)add("consistency","REVIEW","Verified non-negative best-day profit and positive total profit are required to calculate consistency.");
 else{const ratio=account.bestDayProfit/account.totalProfit*100;add("consistency",ratio<=profile.consistencyRulePct?"PASS":"BLOCK",`Best day is ${ratio.toFixed(2)}% of total profit against maximum ${profile.consistencyRulePct.toFixed(2)}%.`);}
 if(profile.minimumTradingDays===null||account.tradingDaysCompleted===null)add("minimum_days","REVIEW","Minimum trading-day requirement or progress is unknown.");
 else if(!Number.isInteger(profile.minimumTradingDays)||profile.minimumTradingDays<1||!Number.isInteger(account.tradingDaysCompleted)||account.tradingDaysCompleted<0)add("minimum_days_validation","BLOCK","Trading-day requirement and completed-day count must be valid non-negative integers.");
 else add("minimum_days",account.tradingDaysCompleted>=profile.minimumTradingDays?"PASS":"REVIEW",`${account.tradingDaysCompleted} of ${profile.minimumTradingDays} required trading days completed.`);
 if(profile.profitTargetPct===null||account.totalProfit===null)add("challenge_pacing","REVIEW","Profit target or verified total profit is unknown; challenge pacing cannot be assessed.");
 else if(!n(profile.profitTargetPct)||profile.profitTargetPct<=0||!n(account.initialBalance)||account.initialBalance<=0||!n(account.totalProfit))add("challenge_pacing","REVIEW","A positive verified profit target, initial balance and total profit are required.");
 else{const target=account.initialBalance*profile.profitTargetPct/100,progress=account.totalProfit/target*100;add("challenge_pacing","PASS",`Profit target progress is ${progress.toFixed(2)}% (${account.totalProfit.toFixed(2)} of ${target.toFixed(2)}).`);}
 if(!n(proposed.cashRisk)||proposed.cashRisk<=0||!n(proposed.additionalOpenPositions)||!Number.isInteger(proposed.additionalOpenPositions)||proposed.additionalOpenPositions<0)add("proposed_risk","BLOCK","Proposed cash risk must be positive and additional position count a non-negative integer.");
 const overall=checks.some(x=>x.status==="BLOCK")?"BLOCK":checks.some(x=>x.status==="REVIEW")?"REVIEW":"PASS";
 return {engineVersion:PROP_RULE_ENGINE_VERSION,overall,checks};
}
