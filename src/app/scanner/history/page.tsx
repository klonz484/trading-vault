import Link from "next/link";
import { Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";
import { parseScannerSummary } from "@/lib/scanner/summary";

export const instant = false;


type StoredAnalysis = {
  text?: string;
  notes?: string;
  warning?: string;
  planAudits?: Array<{ scenario: string; entryType?: "exact" | "range" | "conditional_close"; entry?: number | null; entryLow?: number; entryHigh?: number; stop: number; target: number; riskDistanceMin?: number; riskDistanceMax?: number; rewardDistanceMin?: number; rewardDistanceMax?: number; riskRewardMin?: number; riskRewardMax?: number; riskDistance?: number; rewardDistance?: number; riskReward?: number; pipSize: number | null; riskPipsMin?: number | null; riskPipsMax?: number | null; rewardPipsMin?: number | null; rewardPipsMax?: number | null; riskPips?: number | null; rewardPips?: number | null; arithmeticValid?: boolean; directionValid?: boolean; technicalStatus?: "unverified"; valid: boolean; issues: string[] }>;
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
      const analysisText = analysis?.text || "No saved analysis text.";
      const parsedSummary = parseScannerSummary(analysisText);
      const setupSummary = scan.status === "completed" ? parsedSummary : { ...parsedSummary, decision: "NO TRADE" as const, orderType: "NONE" as const, entryType: "none" as const, entry: null, entryLow: null, entryHigh: null, stopLoss: null, takeProfit1: null, takeProfit2: null, takeProfit3: null, invalidation: null, reason: "This scan did not finish normally. Its trade levels are hidden; run a fresh scan before considering a setup." };
      return { ...scan, imageUrl, analysisText, setupSummary, notes: analysis?.notes || "", analysisWarning: analysis?.warning || "", planAudits: analysis?.planAudits || [] };
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
                <div className={`mt-4 rounded-xl border p-4 ${scan.setupSummary.decision === "BUY" ? "border-emerald-500/40 bg-emerald-500/10" : scan.setupSummary.decision === "SELL" ? "border-rose-500/40 bg-rose-500/10" : "border-slate-500/40 bg-slate-500/10"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-2xl font-bold text-white">{scan.setupSummary.decision}</p>
                    {scan.setupSummary.orderType !== "NONE" && <span className="text-xs text-white border border-white/20 rounded-full px-2 py-1">{scan.setupSummary.orderType} ORDER</span>}
                  </div>
                  <p className="text-sm text-[var(--foreground)] mt-2">{scan.setupSummary.reason}</p>
                  {scan.setupSummary.decision !== "NO TRADE" && <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs">
                    <div className="rounded bg-black/20 p-2"><span className="text-[var(--muted)]">Entry</span><p className="text-white font-semibold">{scan.setupSummary.entryType === "range" ? `${scan.setupSummary.entryLow}–${scan.setupSummary.entryHigh}` : scan.setupSummary.entry}</p></div>
                    <div className="rounded bg-black/20 p-2"><span className="text-[var(--muted)]">Stop loss</span><p className="text-rose-300 font-semibold">{scan.setupSummary.stopLoss}</p></div>
                    <div className="rounded bg-black/20 p-2"><span className="text-[var(--muted)]">Take profit 1</span><p className="text-emerald-300 font-semibold">{scan.setupSummary.takeProfit1}</p></div>
                    {scan.setupSummary.takeProfit2 !== null && <div className="rounded bg-black/20 p-2"><span className="text-[var(--muted)]">Take profit 2</span><p className="text-emerald-300 font-semibold">{scan.setupSummary.takeProfit2}</p></div>}
                    {scan.setupSummary.takeProfit3 !== null && <div className="rounded bg-black/20 p-2"><span className="text-[var(--muted)]">Take profit 3</span><p className="text-emerald-300 font-semibold">{scan.setupSummary.takeProfit3}</p></div>}
                  </div>}
                  <p className="text-[11px] text-amber-200 mt-3">Confidence not calibrated · Technical levels unverified</p>
                </div>
                {scan.status !== "completed" && (
                  <div role="alert" className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">
                    {scan.analysisWarning || "This scan is marked incomplete. Do not treat it as a complete trade plan; run a fresh analysis if you need the missing sections."}
                  </div>
                )}
                {scan.planAudits.length > 0 && <div className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
                  <p className="text-xs font-semibold text-cyan-200 mb-2">Trade-plan arithmetic check</p>
                  <p className="text-[11px] text-[var(--muted)] mb-3">Computed from AI-proposed values; checks arithmetic and direction, not chart accuracy.</p>
                  {scan.planAudits.map((plan, index) => <div key={index} className="text-xs mb-3 last:mb-0">
                    <p className="font-semibold text-white capitalize">{plan.scenario} scenario — <span className={plan.valid ? "text-emerald-300" : "text-rose-300"}>{plan.valid ? "Arithmetic consistent" : "Check required"}</span></p>
                    <p className="text-[var(--muted)]">{plan.entryType === "range" ? `Entry area ${plan.entryLow}–${plan.entryHigh}` : plan.entryType === "conditional_close" ? `Close trigger ${plan.entry ?? plan.entryLow}` : `Exact entry ${plan.entry ?? plan.entryLow}`} · Stop {plan.stop} · Target {plan.target}</p>
                    <p className="text-[var(--muted)]">Risk {Number(plan.riskDistanceMin ?? plan.riskDistance ?? 0).toFixed(5)}{plan.riskDistanceMax !== undefined && plan.riskDistanceMax !== plan.riskDistanceMin ? `–${plan.riskDistanceMax.toFixed(5)}` : ""}{plan.riskPipsMin != null ? ` (${plan.riskPipsMin.toFixed(1)}–${Number(plan.riskPipsMax ?? plan.riskPipsMin).toFixed(1)} pips)` : plan.riskPips != null ? ` (${plan.riskPips.toFixed(1)} pips)` : ""} · Reward {Number(plan.rewardDistanceMin ?? plan.rewardDistance ?? 0).toFixed(5)}{plan.rewardDistanceMax !== undefined && plan.rewardDistanceMax !== plan.rewardDistanceMin ? `–${plan.rewardDistanceMax.toFixed(5)}` : ""}{plan.rewardPipsMin != null ? ` (${plan.rewardPipsMin.toFixed(1)}–${Number(plan.rewardPipsMax ?? plan.rewardPipsMin).toFixed(1)} pips)` : plan.rewardPips != null ? ` (${plan.rewardPips.toFixed(1)} pips)` : ""} · R:R {Number(plan.riskRewardMin ?? plan.riskReward ?? 0).toFixed(2)}{plan.riskRewardMax !== undefined && plan.riskRewardMax !== plan.riskRewardMin ? `–${plan.riskRewardMax.toFixed(2)}` : ""}R</p>
                    <p className="text-[11px] text-amber-200 mt-1">Arithmetic: {(plan.arithmeticValid ?? plan.valid) ? "valid" : "invalid"} · Direction: {(plan.directionValid ?? plan.valid) ? "valid" : "invalid"} · Technical levels: unverified</p>
                    {plan.issues.map((issue, issueIndex) => <p key={issueIndex} className="text-rose-300 mt-1">{issue}</p>)}
                    {plan.pipSize === null && <p className="text-amber-200 mt-1">Pip conversion is not configured for this instrument.</p>}
                  </div>)}
                </div>}
                <details className="mt-4 rounded-lg border border-[var(--border)] p-3"><summary className="cursor-pointer text-sm font-medium text-cyan-200">View detailed analysis</summary><div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{scan.analysisText.replace(/TV_SETUP_SUMMARY_START\\s*\\n[\\s\\S]*?\\nTV_SETUP_SUMMARY_END/gi, "").replace(/TV_PLAN_AUDIT_START\\s*\\n[\\s\\S]*?\\nTV_PLAN_AUDIT_END/gi, "").trim()}</div></details>
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
