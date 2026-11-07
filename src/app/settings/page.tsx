"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { SETTINGS_STORAGE_KEY } from "@/lib/workspace";

type Preferences = { instrument: string; timeframe: string; compactCards: boolean };
const defaults: Preferences = { instrument: "EURUSD", timeframe: "H1", compactCards: false };

export default function SettingsPage() {
  const [prefs,setPrefs] = useState<Preferences>(defaults);
  const [loaded,setLoaded] = useState(false);
  const [saved,setSaved] = useState(false);
  useEffect(()=>{ try { const raw=window.localStorage.getItem(SETTINGS_STORAGE_KEY); if(raw) setPrefs({...defaults,...JSON.parse(raw)}); } catch {} setLoaded(true); },[]);
  const update=(next:Partial<Preferences>)=>{setPrefs(current=>({...current,...next}));setSaved(false);};
  const save=()=>{window.localStorage.setItem(SETTINGS_STORAGE_KEY,JSON.stringify(prefs));setSaved(true);};
  return <div className="min-h-screen md:flex"><Sidebar /><main className="min-w-0 flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8"><div className="mx-auto max-w-4xl">
    <div className="mb-7"><p className="eyebrow">Workspace</p><h1 className="page-title">Settings</h1><p className="page-subtitle">Local display preferences for this browser.</p></div>
    <section className="panel p-5 sm:p-7"><h2 className="section-title">Trading defaults</h2><p className="mt-1 text-xs text-slate-500">These preferences are saved on this device only.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="field-label">Default instrument<select value={prefs.instrument} onChange={e=>update({instrument:e.target.value})} className="field-control"><option>EURUSD</option><option>XAUUSD</option><option>GBPUSD</option><option>USDJPY</option><option>AUDUSD</option><option>USDCAD</option></select></label><label className="field-label">Default timeframe<select value={prefs.timeframe} onChange={e=>update({timeframe:e.target.value})} className="field-control">{["M1","M5","M15","M30","H1","H4","D1","W1"].map(x=><option key={x}>{x}</option>)}</select></label></div><label className="mt-5 flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={prefs.compactCards} onChange={e=>update({compactCards:e.target.checked})} className="h-4 w-4 accent-slate-200"/> Use compact cards where supported</label><div className="mt-6 flex items-center gap-3"><button onClick={save} disabled={!loaded} className="btn-primary disabled:opacity-50">Save preferences</button>{saved&&<span role="status" className="text-xs text-emerald-300">Saved on this device</span>}</div></section>
    <section className="panel mt-5 p-5"><h2 className="section-title">Connections and security</h2><div className="mt-4 space-y-3">{[["Market data provider","Not connected"],["Supabase authentication","Not configured in this UI"],["Chart image storage","Not connected"],["Trade execution","Manual only"]].map(([name,status])=><div key={name} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3 last:border-0 last:pb-0"><span className="text-sm text-slate-300">{name}</span><span className="text-xs text-slate-500">{status}</span></div>)}</div><p className="mt-4 text-xs leading-5 text-slate-500">No provider credentials, account registration settings, database policies or production secrets are changed by these preferences.</p></section>
  </div></main></div>;
}
