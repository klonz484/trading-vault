import Sidebar from "@/components/Sidebar";
import Link from "next/link";

const watchlist = [
  { symbol: "EURUSD", name: "Euro / US Dollar", price: "—", change: "Awaiting feed", tone: "text-slate-400" },
  { symbol: "GBPUSD", name: "British Pound / US Dollar", price: "—", change: "Awaiting feed", tone: "text-slate-400" },
  { symbol: "USDJPY", name: "US Dollar / Japanese Yen", price: "—", change: "Awaiting feed", tone: "text-slate-400" },
  { symbol: "XAUUSD", name: "Gold / US Dollar", price: "—", change: "Awaiting feed", tone: "text-slate-400" },
];

const actions = [
  { href: "/scanner", icon: "⌗", title: "Scan a chart", description: "Upload an MT5 screenshot" },
  { href: "/risk", icon: "▦", title: "Calculate risk", description: "Plan position size" },
  { href: "/journal", icon: "▤", title: "Open journal", description: "Review trading records" },
  { href: "/setups", icon: "◇", title: "Explore setups", description: "Review setup workspace" },
  { href: "/brain", icon: "◈", title: "Trading Brain", description: "Explore analytical intelligence" },
  { href: "/analytics", icon: "▥", title: "Performance", description: "Review journal statistics" },
];

export default function Dashboard() {
  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pb-8 pt-5 sm:px-6 lg:px-9 lg:pt-8">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.24em] text-slate-500">Trading Vault / Workspace</p><h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Your trading workspace</h1><p className="mt-1 text-sm text-slate-400">A clear view of your analysis, markets and trading process.</p></div>
            <Link href="/scanner" className="focus-ring inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white px-4 py-3 text-sm font-semibold text-[#101216] shadow-lg shadow-black/20 transition hover:bg-slate-200"><span className="text-lg">⌗</span> Scan a chart</Link>
          </div>

          <section className="panel relative mb-6 overflow-hidden p-5 sm:p-7">
            <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/[0.07]"/><div className="pointer-events-none absolute -right-4 -top-12 h-48 w-48 rounded-full border border-white/[0.05]"/>
            <div className="relative grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
              <div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] uppercase tracking-[.18em] text-slate-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/> Analysis workspace</div><h2 className="max-w-xl text-2xl font-light leading-tight text-white sm:text-3xl">Trade with structure.<br/><span className="platinum-text font-medium">Decide with evidence.</span></h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">OEM+ brings chart review, risk planning and your private trading journal into one focused workspace. All execution remains manual.</p></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="panel-soft p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Primary markets</p><p className="mt-2 text-lg font-semibold text-white">Forex + Gold</p><p className="mt-1 text-xs text-slate-500">EURUSD · XAUUSD focus</p></div>
                <div className="panel-soft p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Execution</p><p className="mt-2 text-lg font-semibold text-white">Manual MT5</p><p className="mt-1 text-xs text-slate-500">No automated orders</p></div>
              </div>
            </div>
          </section>

          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Workspace overview</h2><span className="text-[10px] text-slate-500">Live integrations are not configured by this screen</span></div>
          <section className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[{label:"Market data",value:"Not connected",note:"No live prices displayed",icon:"◉"},{label:"AI analysis",value:"Vision scanner",note:"Image-based review",icon:"✳"},{label:"Trade execution",value:"Manual only",note:"You control every order",icon:"⌁"},{label:"Private workspace",value:"Personal journal",note:"Your records stay yours",icon:"▤"}].map((item,i)=><div key={item.label} className="panel p-4 sm:p-5"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</span><span className="text-xl text-slate-300">{item.icon}</span></div><p className="mt-3 text-base font-semibold text-white sm:text-lg">{item.value}</p><p className="mt-1 text-xs text-slate-500">{item.note}</p></div>)}
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.35fr_.85fr]">
            <section className="panel p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold text-white">Market watchlist</h2><p className="mt-1 text-xs text-slate-500">Connect a licensed data provider to populate live prices.</p></div><span className="rounded-full border border-amber-400/20 bg-amber-400/5 px-2.5 py-1 text-[10px] text-amber-300">Feed not connected</span></div>
              <div className="divide-y divide-white/[0.06]">{watchlist.map((item)=><div key={item.symbol} className="flex items-center justify-between gap-3 py-4"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-slate-200">{item.symbol.slice(0,3)}</div><div className="min-w-0"><p className="text-sm font-semibold text-white">{item.symbol}</p><p className="truncate text-xs text-slate-500">{item.name}</p></div></div><div className="text-right"><p className="text-sm font-medium text-slate-300">{item.price}</p><p className={`mt-1 text-[10px] ${item.tone}`}>{item.change}</p></div></div>)}</div>
            </section>
            <section className="panel p-5 sm:p-6"><h2 className="font-semibold text-white">Quick actions</h2><p className="mt-1 text-xs text-slate-500">Go directly to a workspace tool.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">{actions.map(item=><Link key={item.href} href={item.href} className="focus-ring group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 transition hover:border-white/20 hover:bg-white/[0.06]"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] text-xl text-slate-200">{item.icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-white">{item.title}</span><span className="mt-0.5 block text-xs text-slate-500">{item.description}</span></span><span className="text-slate-600 transition group-hover:translate-x-1 group-hover:text-white">→</span></Link>)}</div></section>
          </div>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="panel p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="font-semibold text-white">Recent activity</h2><Link href="/scanner" className="text-xs text-slate-300 hover:text-white">Start a scan →</Link></div><div className="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center"><p className="text-sm text-slate-300">Your recent scans will appear here.</p><p className="mt-1 text-xs text-slate-500">No scan history is being fabricated or pre-filled.</p></div></div>
            <div className="panel p-5 sm:p-6"><h2 className="font-semibold text-white">Trading Brain</h2><p className="mt-1 text-xs text-slate-500">Independent analysis, collaborative review.</p><div className="mt-5 flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><span className="text-2xl text-slate-200">✳</span><div><p className="text-sm font-medium text-white">Evidence before conviction</p><p className="mt-1 text-xs leading-5 text-slate-500">The Brain should explain supporting evidence, opposing evidence, uncertainty and invalidation—not simply repeat a scanner signal.</p></div></div></div>
          </section>
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-5 text-[10px] text-slate-600"><span>OEM+ ChartScanner · Trading Vault</span><span>Research support only · Manual execution</span></footer>
        </div>
      </main>
    </div>
  );
}
