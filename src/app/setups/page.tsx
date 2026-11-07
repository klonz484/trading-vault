import Link from "next/link";
import Sidebar from "@/components/Sidebar";

const watch = [
  { symbol: "EURUSD", label: "Euro / US Dollar", focus: "Primary Forex focus" },
  { symbol: "XAUUSD", label: "Gold / US Dollar", focus: "Primary metals focus" },
  { symbol: "GBPUSD", label: "British Pound / US Dollar", focus: "Major pair" },
  { symbol: "USDJPY", label: "US Dollar / Japanese Yen", focus: "Major pair" },
];

export default function SetupsPage() {
  return <div className="min-h-screen md:flex"><Sidebar /><main className="min-w-0 flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8"><div className="mx-auto max-w-[1400px]">
    <div className="mb-7"><p className="eyebrow">Planning workspace</p><h1 className="page-title">AI Setups</h1><p className="page-subtitle">Session preparation and conditional trade planning for Forex majors and Gold.</p></div>
    <section className="panel mb-6 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-2xl"><span className="status-warning">Live market feed not connected</span><h2 className="mt-4 text-2xl font-light text-white">Prepare the plan. Wait for the evidence.</h2><p className="mt-2 text-sm leading-6 text-slate-400">OEM+ will not invent prices or publish fabricated setups. Until a licensed data source and validated setup engine are connected, this workspace helps you prepare instruments and review chart evidence.</p></div><Link href="/scanner" className="btn-primary">Analyse a chart <span aria-hidden>→</span></Link></div></section>
    <div className="mb-3 flex items-center justify-between"><h2 className="section-title">Instrument focus</h2><span className="text-xs text-slate-500">Watchlist · no live quotes</span></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{watch.map((item)=><article key={item.symbol} className="panel p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-white">{item.symbol}</span><span className="h-2 w-2 rounded-full bg-slate-500"/></div><p className="mt-1 text-xs text-slate-500">{item.label}</p><p className="mt-5 text-xs text-slate-300">{item.focus}</p><p className="mt-2 text-[10px] text-amber-300">Awaiting validated market data</p></article>)}</div>
    <section className="panel mt-6 p-5 sm:p-6"><h2 className="section-title">Setup validation checklist</h2><p className="mt-1 text-xs text-slate-500">Use this as a review framework; no items are marked confirmed automatically.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{["Higher-timeframe context is clear","Liquidity objective is identified","Structure shift is confirmed on closed candles","Displacement supports the thesis","Entry zone is defined and still valid","Stop and invalidation are explicit","Risk is within the account rules","News and session constraints are checked","Opposing evidence has been reviewed"].map(item=><div key={item} className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-slate-600"/><span className="text-sm text-slate-300">{item}</span></div>)}</div></section>
  </div></main></div>;
}
