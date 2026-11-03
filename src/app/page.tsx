import Sidebar from "@/components/Sidebar";
import Link from "next/link";

export default function Dashboard() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Personal AI trading workspace • Forex Majors + Gold
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider">
              Focus Pairs
            </p>
            <p className="text-lg font-semibold text-white mt-1">
              EURUSD • XAUUSD
            </p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider">
              Mode
            </p>
            <p className="text-lg font-semibold text-cyan-400 mt-1">
              Analysis Only
            </p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider">
              AI Engine
            </p>
            <p className="text-lg font-semibold text-emerald-400 mt-1">
              Free Models
            </p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider">
              Execution
            </p>
            <p className="text-lg font-semibold text-white mt-1">Manual MT5</p>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {/* Chart Scanner */}
          <Link
            href="/scanner"
            className="group bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 hover:border-cyan-500/40 hover:bg-[var(--card-hover)] transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 text-lg">
                ▣
              </div>
              <h2 className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                AI Chart Scanner
              </h2>
            </div>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Upload any MT5 chart screenshot. Get structured technical
              analysis, key levels, bias and suggested setups.
            </p>
            <div className="mt-4 text-xs text-cyan-400/80 font-medium">
              Highest priority →
            </div>
          </Link>

          {/* AI Setups */}
          <Link
            href="/setups"
            className="group bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 hover:border-cyan-500/40 hover:bg-[var(--card-hover)] transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 text-lg">
                ▲
              </div>
              <h2 className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                Daily / Session Setups
              </h2>
            </div>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              AI-generated trade ideas with clear entry zones, stop loss, take
              profit targets and reasoning for majors + gold.
            </p>
            <div className="mt-4 text-xs text-cyan-400/80 font-medium">
              Coming next →
            </div>
          </Link>

          {/* Risk Calculator */}
          <Link
            href="/risk"
            className="group bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 hover:border-cyan-500/40 hover:bg-[var(--card-hover)] transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 text-lg">
                ◎
              </div>
              <h2 className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                Risk Calculator
              </h2>
            </div>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Position sizing for MT5. Input account balance, risk %, stop
              distance → get exact lot size and R:R.
            </p>
            <div className="mt-4 text-xs text-cyan-400/80 font-medium">
              Ready to use →
            </div>
          </Link>

          {/* Journal */}
          <Link
            href="/journal"
            className="group bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 hover:border-cyan-500/40 hover:bg-[var(--card-hover)] transition-all md:col-span-2 xl:col-span-1"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 text-lg">
                ▤
              </div>
              <h2 className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                Trading Journal
              </h2>
            </div>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Log trades, track performance, win rate, R-multiple and personal
              stats. Completely private.
            </p>
          </Link>
        </div>

        {/* Bottom note */}
        <div className="mt-10 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]/50">
          <p className="text-sm text-[var(--muted)]">
            <span className="text-cyan-400 font-medium">Trading Vault</span> is
            built for single-user use only. No community, no broker integration,
            no leaderboards. Pure analysis + signals for manual execution on
            MT5.
          </p>
        </div>
      </main>
    </div>
  );
}
