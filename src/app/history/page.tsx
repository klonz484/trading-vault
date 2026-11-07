import { Suspense } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";

type ScanRow = {
  id: string;
  symbol: string;
  timeframe: string;
  image_path: string | null;
  status: string;
  analysis: { observation?: { scanId?: string; packetStatus?: string; quality?: { rating?: string }; missingCriticalFields?: string[]; marketLocation?: { description?: { value?: string | null } } }; brainStatus?: string } | null;
  model_name: string | null;
  created_at: string;
};

async function HistoryContent() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("chart_scans")
    .select("id,symbol,timeframe,image_path,status,analysis,model_name,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const scans = (data || []) as ScanRow[];

  return <div className="mx-auto max-w-[1300px]">
    <div className="mb-7"><p className="eyebrow">Research archive</p><h1 className="page-title">Scan History</h1><p className="page-subtitle">Private chart observations saved to your Trading Vault account.</p></div>
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-5"><div><h2 className="section-title">Saved observations</h2><p className="mt-1 text-xs text-slate-500">{scans.length} saved scans · private Supabase storage</p></div><Link href="/scanner" className="btn-primary">New scan</Link></div>
      {error ? <div role="alert" className="p-5 text-sm text-rose-200">Scan history could not be loaded. Refresh the page and try again.</div> :
      scans.length === 0 ? <div className="px-5 py-16 text-center"><div className="text-3xl text-slate-300/60">◷</div><h3 className="mt-4 text-sm font-semibold text-white">No saved observations yet</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">A successful chart capture will be saved privately to your account and available across your signed-in devices.</p><Link href="/scanner" className="btn-primary mt-5 inline-flex">Open Chart Scanner</Link></div> :
      <div className="divide-y divide-white/[0.06]">{scans.map(scan => {
        const observation = scan.analysis?.observation;
        const description = observation?.marketLocation?.description?.value;
        return <article key={scan.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{scan.symbol}</h3><span className="status-neutral">{scan.timeframe}</span><span className="status-neutral">{scan.status.toUpperCase()}</span></div><p className="mt-1 text-[10px] text-slate-500">{new Date(scan.created_at).toLocaleString()} · {scan.model_name || "Vision model"}</p></div><p className="text-[10px] text-slate-500">Private image saved</p></div><div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Visible chart description</p><p className="mt-2 text-xs leading-5 text-slate-300">{typeof description === "string" && description ? description : "No readable chart description was extracted."}</p><p className="mt-2 text-[10px] text-slate-500">Image quality: {observation?.quality?.rating || "Unknown"} · Packet: {observation?.packetStatus || "Unknown"} · Brain: not connected</p>{(observation?.missingCriticalFields?.length || 0) > 0 && <p className="mt-2 text-[10px] text-amber-200">Missing: {observation?.missingCriticalFields?.join(", ")}</p>}</div></article>;
      })}</div>}
    </section>
    <p className="mt-4 text-xs leading-5 text-slate-500">Images and observation packets are stored in your private account. Row-level security restricts each record to its owner. No trade execution data is created by the Scanner.</p>
  </div>;
}

function HistoryLoading() {
  return <div className="mx-auto max-w-[1300px]"><div className="mb-7"><p className="eyebrow">Research archive</p><h1 className="page-title">Scan History</h1><p className="page-subtitle">Loading your private chart observations…</p></div><section className="panel min-h-64 animate-pulse p-5" /></div>;
}

export default function HistoryPage() {
  return <div className="min-h-screen md:flex"><Sidebar /><main className="min-w-0 flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8"><Suspense fallback={<HistoryLoading />}><HistoryContent /></Suspense></main></div>;
}
