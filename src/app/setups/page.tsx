import Link from "next/link";
import Sidebar from "@/components/Sidebar";

const lifecycle = [
  { label: "Detected", description: "The Brain identifies a possible opportunity." },
  { label: "Preparing", description: "A scenario is assembled with evidence and invalidation." },
  { label: "Monitoring", description: "The scenario waits for closed-candle and trigger confirmation." },
  { label: "Active", description: "All data, evidence, collaboration and risk gates pass." },
];

const watch = [
  { symbol: "EURUSD", label: "Euro / US Dollar", focus: "Primary Forex focus" },
  { symbol: "XAUUSD", label: "Gold / US Dollar", focus: "Primary metals focus" },
  { symbol: "GBPUSD", label: "British Pound / US Dollar", focus: "Major pair" },
  { symbol: "USDJPY", label: "US Dollar / Japanese Yen", focus: "Major pair" },
];

export default function SetupsPage() {
  return <div className="min-h-screen md:flex"><Sidebar /><main className="min-w-0 flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8"><div className="mx-auto max-w-[1400px]">
    <div className="mb-7"><p className="eyebrow">Autonomous signal intelligence</p><h1 className="page-title">Upcoming Signals</h1><p className="page-subtitle">Background opportunity monitoring, scenario preparation and confirmation alerts.</p></div>

    <section className="panel mb-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <span className="status-warning">Background monitor not running</span>
          <h2 className="mt-4 text-2xl font-light text-white">The Brain should watch. You decide when to act.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">This workspace is prepared for autonomous monitoring. It will not display fabricated opportunities: continuous market ingestion, verified signal generation and email delivery are not connected yet.</p>
        </div>
        <Link href="/scanner" className="btn-primary">Scan a chart <span aria-hidden>→</span></Link>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="panel-soft p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Market monitoring</p><p className="mt-2 text-sm font-semibold text-white">Not connected</p><p className="mt-1 text-xs text-slate-500">Requires persistent live data</p></div>
        <div className="panel-soft p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Signal authority</p><p className="mt-2 text-sm font-semibold text-white">Fail-closed</p><p className="mt-1 text-xs text-slate-500">No directional signal is authorised</p></div>
        <div className="panel-soft p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Email notifications</p><p className="mt-2 text-sm font-semibold text-white">Not configured</p><p className="mt-1 text-xs text-slate-500">No email will be sent yet</p></div>
      </div>
    </section>

    <section className="panel mb-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="section-title">Signal pipeline</h2><p className="mt-1 text-xs text-slate-500">A scenario must pass every stage; monitoring is not a trade recommendation.</p></div><span className="status-neutral">Design verified · simulation only</span></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{lifecycle.map((item, index)=><article key={item.label} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-[.16em] text-slate-500">Stage 0{index + 1}</span><span className="text-xs text-slate-500">{index === 3 ? "Gated" : "Pending"}</span></div><h3 className="mt-3 text-sm font-semibold text-white">{item.label}</h3><p className="mt-2 text-xs leading-5 text-slate-400">{item.description}</p></article>)}</div>
    </section>

    <section className="panel mb-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="section-title">Signal inbox</h2><p className="mt-1 text-xs text-slate-500">Current opportunities and upcoming session scenarios appear here only after validated preparation.</p></div><span className="status-neutral">0 validated signals</span></div>
      <div className="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-9 text-center"><p className="text-sm font-medium text-slate-200">No validated signals yet</p><p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-slate-500">The Brain is not running continuous background analysis. This empty state is intentional until the market-data worker and verified strategy engine are connected.</p></div>
    </section>

    <section className="panel mb-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="section-title">Email alert policy</h2><p className="mt-1 text-xs text-slate-500">The notification rules are defined and unit-tested; delivery is not enabled.</p></div><span className="status-warning">Delivery not connected</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><p className="text-sm font-medium text-white">When a signal becomes active</p><p className="mt-1 text-xs leading-5 text-slate-400">Send one notification after all evidence, freshness, closed-candle, conflict, collaboration and risk checks pass.</p></div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><p className="text-sm font-medium text-white">When an active signal changes</p><p className="mt-1 text-xs leading-5 text-slate-400">Send meaningful suspension, invalidation or expiry updates. Suppress duplicate events using an idempotency key.</p></div>
      </div>
    </section>

    <div className="mb-3 flex items-center justify-between"><h2 className="section-title">Instrument focus</h2><span className="text-xs text-slate-500">Watchlist · no live quotes</span></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{watch.map((item)=><article key={item.symbol} className="panel p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-white">{item.symbol}</span><span className="h-2 w-2 rounded-full bg-slate-500"/></div><p className="mt-1 text-xs text-slate-500">{item.label}</p><p className="mt-5 text-xs text-slate-300">{item.focus}</p><p className="mt-2 text-[10px] text-amber-300">Awaiting validated market data</p></article>)}</div>
  </div></main></div>;
}
