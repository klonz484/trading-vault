"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { readLocalList, SavedScan, SCAN_STORAGE_KEY, writeLocalList } from "@/lib/workspace";

export default function HistoryPage(){
 const [scans,setScans]=useState<SavedScan[]>([]);
 useEffect(()=>{const timer=window.setTimeout(()=>setScans(readLocalList<SavedScan>(SCAN_STORAGE_KEY)),0);return ()=>window.clearTimeout(timer);},[]);
 function remove(id:string){const next=scans.filter(s=>s.id!==id);setScans(next);writeLocalList(SCAN_STORAGE_KEY,next);}
 function clear(){setScans([]);writeLocalList(SCAN_STORAGE_KEY,[]);}
 return <div className="min-h-screen md:flex"><Sidebar/><main className="min-w-0 flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8"><div className="mx-auto max-w-[1300px]"><div className="mb-7"><p className="eyebrow">Research archive</p><h1 className="page-title">Scan History</h1><p className="page-subtitle">Previously completed chart reads saved in this browser.</p></div>
 <section className="panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-5"><div><h2 className="section-title">Saved analyses</h2><p className="mt-1 text-xs text-slate-500">{scans.length} saved scans · local browser storage</p></div><div className="flex gap-2"><Link href="/scanner" className="btn-primary">New scan</Link>{scans.length>0&&<button onClick={clear} className="btn-secondary">Clear history</button>}</div></div>
 {scans.length===0?<div className="px-5 py-16 text-center"><div className="text-3xl text-slate-300/60">◷</div><h3 className="mt-4 text-sm font-semibold text-white">No saved scans yet</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">After a successful chart analysis, the result will be saved here on this device.</p><Link href="/scanner" className="btn-primary mt-5 inline-flex">Open Chart Scanner</Link></div>:<div className="divide-y divide-white/[0.06]">{scans.map(s=><article key={s.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{s.symbol}</h3><span className="status-neutral">{s.timeframe}</span></div><p className="mt-1 text-[10px] text-slate-500">{new Date(s.createdAt).toLocaleString()} · {s.model}</p></div><button onClick={()=>remove(s.id)} className="text-xs text-slate-500 hover:text-rose-300">Delete</button></div><p className="mt-3 text-sm leading-6 text-slate-300">{s.summary || "Saved analysis — open the full report to review the original findings."}</p>
{s.sections && <div className="mt-4 grid gap-3 sm:grid-cols-2">
{([{key:"visible",label:"Visible chart evidence"},{key:"structure",label:"Market structure"},{key:"levels",label:"Support & resistance"},{key:"momentum",label:"Momentum & patterns"},{key:"scenarios",label:"Bullish / bearish scenarios"},{key:"plan",label:"Trade plan framework"},{key:"uncertainty",label:"Uncertainty & data gaps"}] as const).map(section => s.sections?.[section.key] ? <div key={section.key} className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><h4 className="text-xs font-semibold text-white">{section.label}</h4><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-400">{s.sections[section.key]}</p></div> : null)}
</div>}
<details className="mt-4"><summary className="cursor-pointer text-xs text-slate-300 hover:text-white">View original full analysis</summary><div className="mt-3 whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-black/20 p-4 text-xs leading-6 text-slate-300">{s.analysis}</div></details>
<p className="mt-3 text-[10px] text-slate-600">Archive format {s.schemaVersion || 1} · revision {s.revision || 1} · screenshot not retained</p></article>)}</div>}
 </section><p className="mt-4 text-xs leading-5 text-slate-500">Scan history is stored only in this browser and is not synced to an account or Supabase. Avoid using shared devices for private trading records.</p>
 </div></main></div>;
}
