"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { parseScannerSummary, type ScannerSummary } from "@/lib/scanner/summary";

type PlanAudit = {
  scenario: string; entryType?: "exact" | "range" | "conditional_close"; entry?: number | null; entryLow?: number; entryHigh?: number;
  stop: number; target: number; riskDistanceMin?: number; riskDistanceMax?: number; rewardDistanceMin?: number; rewardDistanceMax?: number;
  riskRewardMin?: number; riskRewardMax?: number; riskDistance?: number; rewardDistance?: number; riskReward?: number;
  pipSize: number | null; riskPipsMin?: number | null; riskPipsMax?: number | null; rewardPipsMin?: number | null; rewardPipsMax?: number | null;
  riskPips?: number | null; rewardPips?: number | null; arithmeticValid?: boolean; directionValid?: boolean; technicalStatus?: "unverified";
  valid: boolean; issues: string[];
};
type AnalysisResponse = { analysis?: string; model?: string; status?: string; warning?: string; planAudits?: PlanAudit[]; error?: string };

function formatPrice(value: number | null): string {
  return value === null ? "—" : value.toString();
}

function entryLabel(summary: ScannerSummary): string {
  if (summary.entryType === "range") return "Entry zone";
  if (summary.entryType === "conditional_close") return "Close trigger";
  return "Entry";
}

function detailedText(value: string): string {
  return value
    .replace(/TV_SETUP_SUMMARY_START\s*\n[\s\S]*?\nTV_SETUP_SUMMARY_END/gi, "")
    .replace(/TV_PLAN_AUDIT_START\s*\n[\s\S]*?\nTV_PLAN_AUDIT_END/gi, "")
    .replace(/^([ \t]*\*\*?\s*5\.\s*)Bullish\/bullish(\s+conditions\s*\*\*?)/gim, "$1Bullish/bearish$2")
    .trim();
}

export default function ScannerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("H1");
  const [notes, setNotes] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);
  const [scanComplete, setScanComplete] = useState(true);
  const [planAudits, setPlanAudits] = useState<PlanAudit[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsedSummary = useMemo(() => result ? parseScannerSummary(result) : null, [result]);
  const summary = useMemo(() => {
    if (!parsedSummary || scanComplete) return parsedSummary;
    return {
      ...parsedSummary,
      decision: "NO TRADE" as const,
      orderType: "NONE" as const,
      entryType: "none" as const,
      entry: null,
      entryLow: null,
      entryHigh: null,
      stopLoss: null,
      takeProfit1: null,
      takeProfit2: null,
      takeProfit3: null,
      invalidation: null,
      reason: "This analysis did not finish normally. Its trade levels are hidden; run a fresh scan before considering any setup.",
    };
  }, [parsedSummary, scanComplete]);

  const selectFile = (selected: File | undefined) => {
    if (!selected) return;
    setError(null);
    setResult(null);
    setModelName(null);
    setAnalysisWarning(null);
    setPlanAudits([]);
    setDetailsOpen(false);
    if (!(["image/png", "image/jpeg", "image/webp"].includes(selected.type))) {
      setError("Please choose a PNG, JPG, or WebP image.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError("This image is larger than 10 MB. Please resize it and try again.");
      return;
    }
    setFile(selected);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(selected);
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    setAnalysisWarning(null);
    setPlanAudits([]);
    setDetailsOpen(false);
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("symbol", symbol);
      body.append("timeframe", timeframe);
      body.append("notes", notes);

      const response = await fetch("/api/scanner/analyze", { method: "POST", body });
      const data = (await response.json()) as AnalysisResponse;
      if (!response.ok) throw new Error(data.error || "Analysis failed. Please try again.");
      setResult(data.analysis || "The model did not return an analysis.");
      setModelName(data.model || "Vision model");
      setAnalysisWarning(data.warning || null);
      setScanComplete(data.status === "completed");
      // Never display arithmetic checks from partial model output.
      setPlanAudits(data.status === "completed" ? (data.planAudits || []) : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const decisionStyle = summary?.decision === "BUY"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
    : summary?.decision === "SELL"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
      : "border-slate-500/40 bg-slate-500/10 text-slate-200";

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 p-5 lg:p-8 overflow-y-auto">
        <div className="mb-7">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-white tracking-tight">AI Chart Scanner</h1>
            <span className="text-[10px] uppercase tracking-wider text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 rounded-full px-2.5 py-1">Scanner V2</span>
          </div>
          <p className="text-sm text-[var(--muted)] mt-1">One clear decision first. Full chart evidence remains available when you need it.</p>
          <Link href="/scanner/history" className="inline-block mt-3 text-xs text-cyan-300 hover:text-cyan-200">View saved scan history →</Link>
        </div>

        <div className="grid xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)] gap-6 max-w-7xl">
          <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 lg:p-6">
            <h2 className="font-medium text-white mb-4">Chart input</h2>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]); }}
              className={`flex flex-col items-center justify-center w-full min-h-64 max-h-[420px] border-2 border-dashed rounded-xl overflow-hidden transition-all ${dragging ? "border-cyan-400 bg-cyan-500/10" : "border-[var(--border)] hover:border-cyan-500/50 hover:bg-[var(--card-hover)]"}`}
            >
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="Selected trading chart" className="max-h-[400px] max-w-full object-contain" />
              ) : (
                <div className="text-center px-5 py-12">
                  <div className="text-4xl text-cyan-400/70 mb-3">▧</div>
                  <p className="text-sm text-white">Drop your chart screenshot here</p>
                  <p className="text-xs text-[var(--muted)] mt-2">or tap to browse · PNG, JPG, WebP · max 10 MB</p>
                </div>
              )}
            </button>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectFile(event.target.files?.[0])} className="hidden" />
            {file && <div className="flex items-center justify-between gap-3 mt-2 text-xs text-[var(--muted)]"><span className="truncate">{file.name}</span><button type="button" onClick={() => { setFile(null); setImagePreview(null); setResult(null); setError(null); setPlanAudits([]); }} className="text-cyan-300 hover:text-cyan-200">Remove</button></div>}

            <div className="grid sm:grid-cols-2 gap-3 mt-5">
              <label className="text-xs text-[var(--muted)]">Instrument
                <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} maxLength={30} placeholder="e.g. EURUSD" className="mt-1.5 w-full rounded-lg bg-black/20 border border-[var(--border)] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/60" />
              </label>
              <label className="text-xs text-[var(--muted)]">Timeframe
                <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} className="mt-1.5 w-full rounded-lg bg-[#111820] border border-[var(--border)] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/60">
                  {["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1", "Not sure"].map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs text-[var(--muted)] mt-3">Your context (optional)
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} placeholder="e.g. Looking for a pullback entry; mark the London session high if visible." className="mt-1.5 w-full resize-y rounded-lg bg-black/20 border border-[var(--border)] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/60 placeholder:text-slate-600" />
            </label>
            <button onClick={analyze} disabled={!file || analyzing} className="mt-5 w-full py-3 rounded-lg bg-cyan-500 text-black font-semibold hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {analyzing ? "Reading chart..." : "Run AI Analysis"}
            </button>
          </section>

          <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 lg:p-6 min-h-[420px]">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-medium text-white">Trading decision</h2>
                <p className="text-xs text-[var(--muted)] mt-1">{symbol} · {timeframe}</p>
              </div>
              {modelName && <span className="text-[10px] text-cyan-300 border border-cyan-500/30 rounded-full px-2 py-1">{modelName}</span>}
            </div>

            {!result && !analyzing && !error && <div className="min-h-[330px] flex flex-col items-center justify-center text-center text-[var(--muted)] text-sm"><div className="text-3xl text-cyan-400/40 mb-3">⌁</div><p>Your BUY, SELL or NO TRADE result will appear here.</p><p className="text-xs mt-2 max-w-xs">Upload a chart and run an analysis. Trading Vault will not force a signal when evidence is incomplete.</p></div>}
            {analyzing && <div className="min-h-[330px] flex flex-col items-center justify-center gap-3"><div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"/><p className="text-sm text-[var(--muted)]">Inspecting market structure, levels and chart context…</p></div>}
            {error && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"><p className="font-medium mb-1">Analysis unavailable</p>{error}</div>}

            {summary && (
              <div className="space-y-4">
                {analysisWarning && <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">{analysisWarning}</div>}
                <div className={`rounded-xl border p-4 sm:p-5 ${decisionStyle}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] opacity-80">Trading decision</p>
                      <h3 className="text-3xl sm:text-4xl font-bold tracking-tight mt-1">{summary.decision}</h3>
                    </div>
                    {summary.orderType !== "NONE" && <span className="rounded-full border border-current/30 px-3 py-1 text-xs font-semibold tracking-wide">{summary.orderType} ORDER</span>}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/90">{summary.reason}</p>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-black/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white">Trade levels</h3>
                    <span className="text-[10px] uppercase tracking-wide text-amber-200">Technical levels unverified</span>
                  </div>
                  {summary.decision === "NO TRADE" ? (
                    <p className="mt-3 text-sm text-[var(--muted)]">No entry, stop loss or targets are shown because there is no complete, validated setup.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                      <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-3">
                        <p className="text-[10px] uppercase text-[var(--muted)]">{entryLabel(summary)}</p>
                        <p className="text-base sm:text-lg font-semibold text-white mt-1">{summary.entryType === "range" ? `${formatPrice(summary.entryLow)}–${formatPrice(summary.entryHigh)}` : formatPrice(summary.entry)}</p>
                      </div>
                      <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-3">
                        <p className="text-[10px] uppercase text-[var(--muted)]">Stop loss</p>
                        <p className="text-base sm:text-lg font-semibold text-rose-300 mt-1">{formatPrice(summary.stopLoss)}</p>
                      </div>
                      <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-3">
                        <p className="text-[10px] uppercase text-[var(--muted)]">Take profit 1</p>
                        <p className="text-base sm:text-lg font-semibold text-emerald-300 mt-1">{formatPrice(summary.takeProfit1)}</p>
                      </div>
                      {summary.takeProfit2 !== null && <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-3"><p className="text-[10px] uppercase text-[var(--muted)]">Take profit 2</p><p className="text-base sm:text-lg font-semibold text-emerald-300 mt-1">{formatPrice(summary.takeProfit2)}</p></div>}
                      {summary.takeProfit3 !== null && <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-3"><p className="text-[10px] uppercase text-[var(--muted)]">Take profit 3</p><p className="text-base sm:text-lg font-semibold text-emerald-300 mt-1">{formatPrice(summary.takeProfit3)}</p></div>}
                      <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-3">
                        <p className="text-[10px] uppercase text-[var(--muted)]">Invalidation</p>
                        <p className="text-sm font-semibold text-white mt-1">{formatPrice(summary.invalidation)}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[var(--border)] p-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-white">Evidence confidence</p>
                    <p className="text-xs text-[var(--muted)] mt-1">Not calibrated — no percentage is displayed until a validated scoring method is available.</p>
                  </div>
                  <span className="text-xs text-amber-200">Unrated</span>
                </div>

                <button type="button" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen} className="w-full rounded-lg border border-cyan-500/30 px-4 py-3 text-sm font-medium text-cyan-200 hover:bg-cyan-500/5 transition-colors">
                  {detailsOpen ? "Hide detailed analysis ↑" : "View detailed analysis ↓"}
                </button>

                {detailsOpen && (
                  <div className="space-y-4">
                    {planAudits.length > 0 && <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
                      <p className="text-xs font-semibold text-cyan-200 mb-2">{summary.decision === "NO TRADE" ? "Conditional scenario arithmetic check" : "Trade-plan arithmetic check"}</p>
                      {summary.decision === "NO TRADE" && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 mb-3">
                        <p className="text-xs font-semibold text-amber-200">Conditional scenario — not an active trade</p>
                        <p className="text-[11px] text-amber-100/80 mt-1">The current decision remains NO TRADE. This scenario describes a possible future setup only; wait for its stated trigger and confirmation. Do not treat these levels as an entry instruction.</p>
                      </div>}
                      <p className="text-[11px] text-[var(--muted)] mb-3">These checks validate price-distance arithmetic and direction only. They do not prove that chart levels are accurate or tradable.</p>
                      <div className="space-y-3">{planAudits.map((plan, index) => <div key={index} className="text-xs">
                        <div className="flex flex-wrap items-center gap-2 mb-1"><span className="font-semibold text-white capitalize">{plan.scenario} scenario</span>{summary.decision === "NO TRADE" && <span className="rounded border border-amber-500/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">Conditional · inactive</span>}<span className={plan.valid ? "text-emerald-300" : "text-rose-300"}>{plan.valid ? "Arithmetic consistent" : "Check required"}</span></div>
                        <p className="text-[var(--muted)]">{plan.entryType === "range" ? `Entry area ${plan.entryLow}–${plan.entryHigh}` : plan.entryType === "conditional_close" ? `Close trigger ${plan.entry ?? plan.entryLow}` : `Exact entry ${plan.entry ?? plan.entryLow}`} · Stop {plan.stop} · Target {plan.target}</p>
                        <p className="text-[var(--muted)]">Risk {Number(plan.riskDistanceMin ?? plan.riskDistance ?? 0).toFixed(5)}{plan.riskDistanceMax !== undefined && plan.riskDistanceMax !== plan.riskDistanceMin ? `–${plan.riskDistanceMax.toFixed(5)}` : ""}{plan.riskPipsMin != null ? ` (${plan.riskPipsMin.toFixed(1)}–${Number(plan.riskPipsMax ?? plan.riskPipsMin).toFixed(1)} pips)` : plan.riskPips != null ? ` (${plan.riskPips.toFixed(1)} pips)` : ""} · Reward {Number(plan.rewardDistanceMin ?? plan.rewardDistance ?? 0).toFixed(5)}{plan.rewardDistanceMax !== undefined && plan.rewardDistanceMax !== plan.rewardDistanceMin ? `–${plan.rewardDistanceMax.toFixed(5)}` : ""}{plan.rewardPipsMin != null ? ` (${plan.rewardPipsMin.toFixed(1)}–${Number(plan.rewardPipsMax ?? plan.rewardPipsMin).toFixed(1)} pips)` : plan.rewardPips != null ? ` (${plan.rewardPips.toFixed(1)} pips)` : ""} · R:R {Number(plan.riskRewardMin ?? plan.riskReward ?? 0).toFixed(2)}{plan.riskRewardMax !== undefined && plan.riskRewardMax !== plan.riskRewardMin ? `–${plan.riskRewardMax.toFixed(2)}` : ""}R</p>
                        <p className="text-[11px] text-amber-200 mt-1">Arithmetic: {(plan.arithmeticValid ?? plan.valid) ? "valid" : "invalid"} · Direction: {(plan.directionValid ?? plan.valid) ? "valid" : "invalid"} · Technical levels: unverified</p>
                        {plan.issues.map((issue, issueIndex) => <p key={issueIndex} className="text-rose-300 mt-1">{issue}</p>)}
                        {plan.pipSize === null && <p className="text-amber-200 mt-1">Pip conversion is not configured for this instrument; price-distance and R:R arithmetic only.</p>}
                      </div>)}</div>
                    </div>}
                    <div className="rounded-lg border border-[var(--border)] bg-black/10 p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">Full chart analysis</h3>
                      <div className="whitespace-pre-wrap text-sm text-[var(--foreground)] leading-7">{detailedText(result || "")}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="mt-6 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]/50 max-w-7xl">
          <p className="text-xs text-[var(--muted)] leading-5"><span className="text-cyan-400">Model:</span> Groq-hosted Qwen 3.8 27B Vision. Your API key stays on the server and is never sent to the browser.</p>
          <p className="text-xs text-[var(--muted)] leading-5 mt-2">Image-based chart reads can be wrong or miss context. Verify every level in MT5. Trading Vault provides research support only; all execution remains manual.</p>
        </div>
      </main>
    </div>
  );
}
