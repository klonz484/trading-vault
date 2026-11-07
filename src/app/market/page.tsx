import Link from "next/link";
import Sidebar from "@/components/Sidebar";

const markets = [
  ["EURUSD","Euro / US Dollar","Forex major","Primary"],
  ["XAUUSD","Gold / US Dollar","Metals","Primary"],
  ["GBPUSD","British Pound / US Dollar","Forex major","Watch"],
  ["USDJPY","US Dollar / Japanese Yen","Forex major","Watch"],
  ["AUDUSD","Australian Dollar / US Dollar","Forex major","Watch"],
  ["USDCAD","US Dollar / Canadian Dollar","Forex major","Watch"],
];

export default function MarketPage() {
  return <div className="min-h-screen md:flex"><Sidebar /><main className="min-w-0 flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8"><div className="mx-auto max-w-[1400px]">
    <div className="mb-7"><p className="eyebrow">Market workspace</p><h1 className="page-title">Market Overview</h1><p className="page-subtitle">Your Forex and Gold coverage, with transparent source status.</p></div>
    <section className="panel mb-6 flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="text-sm font-semibold text-white">Market data connection</p><p className="mt-1 text-xs text-slate-500">No provider is currently supplying live quotes to this screen.</p></div><span className="status-warning">Not connected</span></section>
    <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-white/[0.07] p-5"><div><h2 className="section-title">Watchlist</h2><p className="mt-1 text-xs text-slate-500">Quotes remain blank until a validated source is configured.</p></div><Link href="/scanner" className="btn-secondary">Scan chart</Link></div>
      <div className="hidden grid-cols-[1.2fr_1.4fr_.8fr_.7fr] gap-4 px-5 py-3 text-[10px] uppercase tracking-wider text-slate-500 sm:grid"><span>Instrument</span><span>Market</span><span>Last price</span><span>Source</span></div>
      {markets.map(([symbol,name,kind,priority])=><div key={symbol} className="grid gap-2 border-b border-white/[0.05] px-5 py-4 last:border-0 sm:grid-cols-[1.2fr_1.4fr_.8fr_.7fr] sm:items-center sm:gap-4"><div><p className="text-sm font-semibold text-white">{symbol}</p><p className="text-xs text-slate-500">{name}</p></div><p className="text-xs text-slate-400">{kind} · {priority}</p><p className="text-sm text-slate-500">—</p><p className="text-[10px] text-amber-300">No feed</p></div>)}
    </section>
    <p className="mt-5 text-xs leading-5 text-slate-500">Provider selection, licensing, timestamp validation, spread checks and provider-disagreement handling must be completed before live data is displayed or used for analysis.</p>
  </div></main></div>;
}
