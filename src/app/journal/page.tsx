import Sidebar from "@/components/Sidebar";

export default function JournalPage() {
  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pb-8 pt-5 sm:px-6 lg:px-9 lg:pt-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Trading Journal
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Private performance tracking
          </p>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-8 text-center max-w-2xl">
          <div className="text-4xl text-slate-200/50 mb-4">▤</div>
          <h2 className="text-lg font-medium text-white mb-2">
            Journal coming soon
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Log trades, calculate win rate, average R, and equity curve. All
            data stays local in your browser for now.
          </p>
        </div>
      </main>
    </div>
  );
}
