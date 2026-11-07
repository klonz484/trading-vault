"use client";

import { useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";

const instruments=["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","XAUUSD"];

export default function RiskCalculatorPage(){
 const [balance,setBalance]=useState("10000");
 const [riskPercent,setRiskPercent]=useState("1");
 const [stopPips,setStopPips]=useState("20");
 const [pair,setPair]=useState("EURUSD");
 const [currency,setCurrency]=useState("USD");
 const [pipValue,setPipValue]=useState("");
 const [targetR,setTargetR]=useState("2");
 const result=useMemo(()=>{const b=Number(balance),r=Number(riskPercent),s=Number(stopPips),v=Number(pipValue),rr=Number(targetR);const valid=[b,r,s,v,rr].every(Number.isFinite)&&b>0&&r>0&&r<=100&&s>0&&v>0&&rr>=0;const risk=b*r/100;return {valid,risk,lot:valid?risk/(s*v):0,reward:valid?risk*rr:0};},[balance,riskPercent,stopPips,pipValue,targetR]);
 function changePair(value:string){setPair(value);setPipValue("");}
 return <div className="min-h-screen md:flex"><Sidebar/><main className="min-w-0 flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8"><div className="mx-auto max-w-[1150px]"><div className="mb-7"><p className="eyebrow">Capital protection</p><h1 className="page-title">Risk Calculator</h1><p className="page-subtitle">Estimate position size from your account risk and broker-specific pip value.</p></div>
 <div className="grid items-start gap-5 lg:grid-cols-[1fr_.9fr]"><section className="panel space-y-5 p-5 sm:p-6"><div><h2 className="section-title">Trade parameters</h2><p className="mt-1 text-xs text-slate-500">Enter values from your MT5 account and contract specification.</p></div>
 <div className="grid grid-cols-2 gap-3"><label className="field-label">Account balance<input className="field-control" type="number" min="0" step="any" value={balance} onChange={e=>setBalance(e.target.value)}/></label><label className="field-label">Account currency<select className="field-control" value={currency} onChange={e=>setCurrency(e.target.value)}>{["USD","ZAR","EUR","GBP"].map(x=><option key={x}>{x}</option>)}</select></label></div>
 <div className="grid grid-cols-2 gap-3"><label className="field-label">Risk per trade (%)<input className="field-control" type="number" min="0" max="100" step="0.1" value={riskPercent} onChange={e=>setRiskPercent(e.target.value)}/></label><label className="field-label">Stop distance (pips / points)<input className="field-control" type="number" min="0" step="any" value={stopPips} onChange={e=>setStopPips(e.target.value)}/></label></div>
 <label className="field-label">Instrument<select className="field-control" value={pair} onChange={e=>changePair(e.target.value)}>{instruments.map(x=><option key={x}>{x}</option>)}</select></label>
 <label className="field-label">Pip / point value per 1.00 standard lot ({currency})<input className="field-control" type="number" min="0" step="any" value={pipValue} onChange={e=>setPipValue(e.target.value)} placeholder="Enter value from your broker"/></label>
 <label className="field-label">Target risk-to-reward ratio<input className="field-control" type="number" min="0" step="0.1" value={targetR} onChange={e=>setTargetR(e.target.value)}/></label>
 <p className="text-[10px] leading-5 text-slate-500">For XAUUSD, enter the correct point value for your broker's contract size and account currency. The calculator intentionally does not guess a Gold pip value.</p>
 </section>
 <section className="panel p-5 sm:p-6"><h2 className="section-title">Position estimate</h2><p className="mt-1 text-xs text-slate-500">Calculated from the values entered.</p>
 <div className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Cash risk</p><p className="mt-2 text-3xl font-semibold text-white">{result.valid?result.risk.toLocaleString(undefined,{style:"currency",currency}):"—"}</p></div>
 <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Estimated position size</p><p className="mt-2 text-4xl font-light text-white">{result.valid?result.lot.toFixed(3):"—"} <span className="text-sm text-slate-500">lots</span></p></div>
 <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Potential result at target R</p><p className="mt-2 text-2xl font-semibold text-emerald-300">{result.valid?result.reward.toLocaleString(undefined,{style:"currency",currency}):"—"}</p></div>
 {!result.valid&&<p role="alert" className="mt-4 text-xs text-amber-300">Enter a positive balance, risk, stop distance and broker pip/point value in the selected account currency to calculate a position estimate.</p>}
 <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4"><p className="text-xs font-medium text-amber-200">Verify before execution</p><p className="mt-1 text-xs leading-5 text-slate-400">This is a sizing estimate, not an order instruction. Confirm tick size, contract size, quote currency conversion, commission and broker volume steps in MT5 before placing any trade.</p></div>
 </section></div>
 </div></main></div>;
}
