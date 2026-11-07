"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { JOURNAL_STORAGE_KEY, JournalTrade, readLocalList, writeLocalList } from "@/lib/workspace";

export default function JournalPage() {
  const [trades,setTrades] = useState<JournalTrade[]>([]);
  const [ready,setReady] = useState(false);
  const [date,setDate] = useState("");
  const [symbol,setSymbol] = useState("EURUSD");
  const [side,setSide] = useState<"BUY"|"SELL">("BUY");
  const [entry,setEntry] = useState("");
  const [stop,setStop] = useState("");
  const [target,setTarget] = useState("");
  const [outcome,setOutcome] = useState<JournalTrade["outcome"]>("OPEN");
  const [rMultiple,setRMultiple] = useState("2");
  const [notes,setNotes] = useState("");
  const [error,setError] = useState("");

  useEffect(()=>{const timer=window.setTimeout(()=>{setTrades(readLocalList<JournalTrade>(JOURNAL_STORAGE_KEY));const now=new Date();setDate([now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-"));setReady(true);},0);return ()=>window.clearTimeout(timer);},[]);
  useEffect(()=>{if(ready) writeLocalList(JOURNAL_STORAGE_KEY,trades);},[trades,ready]);
  const stats=useMemo(()=>{const closed=trades.filter(t=>t.outcome!=="OPEN");const wins=closed.filter(t=>t.outcome==="WIN").length;const losses=closed.filter(t=>t.outcome==="LOSS").length;const sum=closed.reduce((a,t)=>a+(t.outcome==="WIN"?Math.abs(t.rMultiple):t.outcome==="LOSS"?-Math.abs(t.rMultiple):0),0);return {total:trades.length,closed:closed.length,wins,losses,winRate:closed.length?Math.round(wins/closed.length*100):0,netR:sum.toFixed(2)};},[trades]);

  function addTrade(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError("");
    const values=[Number(entry),Number(stop),Number(target),Number(rMultiple)];
    if(!date||!symbol.trim()||values.some(v=>!Number.isFinite(v))||values[0]<=0||values[1]<=0||values[2]<=0||values[3]<0){setError("Enter a valid date, instrument, positive price levels and a non-negative R multiple.");return;}
    const item:JournalTrade={id:crypto.randomUUID(),date,symbol:symbol.toUpperCase().trim(),side,entry:values[0],stop:values[1],target:values[2],outcome,rMultiple:values[3],notes:notes.trim()};
    setTrades(current=>[item,...current]);setEntry("");setStop("");setTarget("");setNotes("");setOutcome("OPEN");
  }
  function removeTrade(id:string){setTrades(current=>current.filter(t=>t.id!==id));}

  return <div className="min-h-screen md:flex"><Sidebar/><main className="min-w-0 flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8"><div className="mx-auto max-w-[1450px]">
    <div className="mb-7"><p className="eyebrow">Personal performance</p><h1 className="page-title">Trading Journal</h1><p className="page-subtitle">Record decisions, outcomes and lessons. Entries are stored locally in this browser.</p></div>
    <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">{[{label:"Total trades",value:stats.total},{label:"Closed trades",value:stats.closed},{label:"Win rate",value:`${stats.winRate}%`},{label:"Net result",value:`${Number(stats.netR)>0?"+":""}${stats.netR}R`}].map(x=><div className="panel p-4 sm:p-5" key={x.label}><p className="text-[10px] uppercase tracking-wider text-slate-500">{x.label}</p><p className="mt-2 text-2xl font-semibold text-white">{x.value}</p></div>)}</div>
    <div className="grid items-start gap-5 xl:grid-cols-[.85fr_1.5fr]">
      <form onSubmit={addTrade} className="panel space-y-4 p-5"><div><h2 className="section-title">Log a trade</h2><p className="mt-1 text-xs text-slate-500">Keep a record of the plan and its result.</p></div>
        <div className="grid grid-cols-2 gap-3"><label className="field-label">Date<input className="field-control" type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label className="field-label">Instrument<input className="field-control uppercase" value={symbol} onChange={e=>setSymbol(e.target.value)} maxLength={20} required/></label></div>
        <div className="grid grid-cols-2 gap-3"><label className="field-label">Direction<select className="field-control" value={side} onChange={e=>setSide(e.target.value as "BUY"|"SELL")}><option value="BUY">BUY</option><option value="SELL">SELL</option></select></label><label className="field-label">Outcome<select className="field-control" value={outcome} onChange={e=>setOutcome(e.target.value as JournalTrade["outcome"])}><option value="OPEN">Open</option><option value="WIN">Win</option><option value="LOSS">Loss</option><option value="BREAKEVEN">Breakeven</option></select></label></div>
        <div className="grid grid-cols-2 gap-3"><label className="field-label">Entry price<input className="field-control" type="number" step="any" value={entry} onChange={e=>setEntry(e.target.value)} required/></label><label className="field-label">Stop loss<input className="field-control" type="number" step="any" value={stop} onChange={e=>setStop(e.target.value)} required/></label></div>
        <div className="grid grid-cols-2 gap-3"><label className="field-label">Target price<input className="field-control" type="number" step="any" value={target} onChange={e=>setTarget(e.target.value)} required/></label><label className="field-label">Result (R)<input className="field-control" type="number" min="0" step="0.1" value={rMultiple} onChange={e=>setRMultiple(e.target.value)} required/></label></div>
        <label className="field-label">Notes<textarea className="field-control min-h-24 resize-y" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1200} placeholder="Why did you take this trade? What did you learn?"/></label>
        {error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}
        <button className="btn-primary w-full" type="submit">Save journal entry</button>
        <p className="text-[10px] leading-4 text-slate-500">Local browser storage only. This journal is not yet synced to Supabase or another device.</p>
      </form>
      <section className="panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] p-5"><div><h2 className="section-title">Trade history</h2><p className="mt-1 text-xs text-slate-500">Your saved journal entries</p></div><span className="status-neutral">{trades.length} records</span></div>
        {!trades.length?<div className="px-5 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-xl text-slate-300">▤</div><h3 className="mt-4 text-sm font-semibold text-white">Your journal starts here</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">Add your first trade to start building a personal record of setups, outcomes and lessons.</p></div>:<div className="divide-y divide-white/[0.06]">{trades.map(t=><article key={t.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-semibold text-white">{t.symbol}</span><span className={t.side==="BUY"?"status-success":"status-danger"}>{t.side}</span><span className={t.outcome==="WIN"?"status-success":t.outcome==="LOSS"?"status-danger":"status-neutral"}>{t.outcome}</span></div><p className="mt-1 text-[10px] text-slate-500">{t.date} · Entry {t.entry} · SL {t.stop} · TP {t.target}</p></div><div className="flex items-center gap-3"><span className="text-sm font-semibold text-white">{t.outcome==="LOSS"?"−":t.outcome==="WIN"?"+":""}{t.outcome==="OPEN"?"Open":t.outcome==="BREAKEVEN"?"0R":`${t.rMultiple}R`}</span><button onClick={()=>removeTrade(t.id)} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-white/5 hover:text-rose-300" aria-label={`Delete ${t.symbol} journal entry`}>Delete</button></div></div>{t.notes&&<p className="mt-3 text-xs leading-5 text-slate-400">{t.notes}</p>}</article>)}</div>}
      </section>
    </div>
  </div></main></div>;
}
