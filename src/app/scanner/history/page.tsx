import Link from "next/link";
import { Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";

export const instant = false;


type StoredAnalysis = {
  text?: string;
  notes?: string;
  warning?: string;
};

async function PrivateScanHistoryContent() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          <h1 className="text-2xl font-semibold text-white">Scan history</h1>
          <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
            Private scan history is unavailable because Supabase is not configured for this deployment.
            Configure the Supabase URL and publishable key in the Vercel environment to enable this page.
          </p>
          <Link href="/scanner" className="inline-block mt-4 text-cyan-300 hover:text-cyan-200">Return to scanner</Link>
        </main>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          <h1 className="text-2xl font-semibold text-white">Scan history</h1>
          <p className="mt-3 text-sm text-[var(--muted)]">Please sign in to view your private scan history.</p>
          <Link href="/login" className="inline-block mt-4 text-cyan-300 hover:text-cyan-200">Go to login</Link>
        </main>
      </div>
    );
  }

  const { data: scans, error } = await supabase
    .from("chart_scans")
    .select("id,symbol,timeframe,image_path,status,analysis,model_name,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const items = await Promise.all(
    (scans || []).map(async (scan) => {
      let imageUrl: string | null = null;
      if (scan.image_path) {
        const { data } = await supabase.storage
          .from("chart-images")
          .createSignedUrl(scan.image_path, 10 * 60);
        imageUrl = data?.signedUrl || null;
      }
      const analysis = scan.analysis as StoredAnalysis | null;
      return { ...scan, imageUrl, analysisText: analysis?.text || "No saved analysis text.", notes: analysis?.notes || "", analysisWarning: analysis?.warning || "" };
    }),
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 p-5 lg:p-8 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-7">
          <div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">Scan history</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Your latest 50 private chart analyses.</p>
          </div>
          <Link href="/scanner" className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400">New scan</Link>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            Your scan history could not be loaded. Please refresh and try again.
          </div>
        )}

        {!error && items.length === 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center max-w-2xl">
            <h2 className="text-lg font-medium text-white">No saved scans yet</h2>
            <p className="text-sm text-[var(--muted)] mt-2">Your completed chart analyses will appear here.</p>
            <Link href="/scanner" className="inline-block mt-4 text-cyan-300 hover:text-cyan-200">Analyze your first chart</Link>
          </div>
        )}

        <div className="grid gap-5 max-w-6xl">
          {items.map((scan) => (
            <article key={scan.id} className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 lg:p-5">
              <div className="min-h-40 rounded-lg bg-black/20 border border-[var(--border)] overflow-hidden flex items-center justify-center">
                {scan.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scan.imageUrl} alt={`${scan.symbol} ${scan.timeframe} chart screenshot`} className="max-h-64 w-full object-contain" />
                ) : (
                  <span className="text-xs text-[var(--muted)]">Image unavailable</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">{scan.symbol}</h2>
                  <span className="rounded-full border border-cyan-500/30 px-2 py-0.5 text-xs text-cyan-300">{scan.timeframe}</span>
                  <span className="text-xs text-[var(--muted)]">{new Date(scan.created_at).toLocaleString()}</span>
                </div>
                <p className="text-xs text-[var(--muted)] mt-1">Model: {scan.model_name || "Not recorded"} · Status: {scan.status}</p>
                {scan.status !== "completed" && (
                  <div role="alert" className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">
                    {scan.analysisWarning || "This scan is marked incomplete. Do not treat it as a complete trade plan; run a fresh analysis if you need the missing sections."}
                  </div>
                )}
                <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{scan.analysisText}</div>
                {scan.notes && <p className="mt-3 text-xs text-[var(--muted)]">Your context: {scan.notes}</p>}
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}


export default function ScannerHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-6 lg:p-8">
            <h1 className="text-2xl font-semibold text-white">Scan history</h1>
            <p className="mt-3 text-sm text-[var(--muted)]">Loading your private scans…</p>
          </main>
        </div>
      }
    >
      <PrivateScanHistoryContent />
    </Suspense>
  );
}
