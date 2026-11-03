import Sidebar from "@/components/Sidebar";

export default function SetupsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Daily / Session AI Setups
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Clear entry • stop • target ideas for majors + gold
          </p>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-8 text-center max-w-2xl">
          <div className="text-4xl text-cyan-400/50 mb-4">▲</div>
          <h2 className="text-lg font-medium text-white mb-2">
            Coming in next iteration
          </h2>
          <p className="text-sm text-[var(--muted)]">
            This page will generate session-based trade ideas using free models.
            Structure is ready — we will wire the AI logic after Chart Scanner is
            solid.
          </p>
        </div>
      </main>
    </div>
  );
}
