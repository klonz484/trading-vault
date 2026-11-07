"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { readLocalList, SavedScan, SCAN_STORAGE_KEY, writeLocalList } from "@/lib/workspace";

type ScannerSetup = {
  decision: "BUY" | "SELL" | "NO TRADE";
  orderType: "MARKET" | "PENDING" | "WAIT";
  confidence: number;
  dataQuality: "CLEAR" | "PARTIAL" | "POOR";
  summary: string;
  entry: { low: number | null; high: number | null; rationale: string };
  stopLoss: { price: number | null; rationale: string };
  targets: { price: number | null; rationale: string }[];
  invalidation: string;
  supportingEvidence: string[];
  opposingEvidence: string[];
  confirmations: string[];
  uncertainties: string[];
  riskReward: string | null;
};

type AnalysisResponse = { setup?: ScannerSetup; analysis?: string; model?: string; error?: string };

const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1", "Not sure"];
const priceLabel = (value: number | null) => value === null ? "Not readable" : String(value);

function EvidenceList({ title, items, tone = "neutral" }: { title: string; items: string[]; tone?: "positive" | "negative" | "neutral" }) {
  const dot = tone === "positive" ? "bg-emerald-300" : tone === "negative" ? "bg-rose-300" : "bg-slate-400";
  return <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
    <h3 className="text-[11px] font-semibold uppercase tracking-[.15em] text-slate-300">{title}</h3>
    {items.length ? <ul className="mt-3 space-y-2">{items.map((item, index) => <li key={index} className="flex gap-2 text-xs leading-5 text-slate-400"><span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />{item}</li>)}</ul> : <p className="mt-3 text-xs text-slate-600">No clear evidence identified.</p>}
  </section>;
}

export default function ScannerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("H1");
  const [notes, setNotes] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [setup, setSetup] = useState<ScannerSetup | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const selectFile = (selected: File | undefined) => {
    if (!selected) return;
    setError(null);
    setSetup(null);
    setModelName(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(selected.type)) {
      setError("Choose a PNG, JPG or WebP chart image.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError("This image is larger than 10 MB. Resize it and try again.");
      return;
    }
    setFile(selected);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(selected);
  };

  const analyze = async () => {
    if (!file || analyzing) return;
    setAnalyzing(true);
    setError(null);
    setSetup(null);
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("symbol", symbol);
      body.append("timeframe", timeframe);
      body.append("notes", notes);
      const response = await fetch("/api/scanner/analyze", { method: "POST", body });
      const data = (await response.json()) as AnalysisResponse;
      if (!response.ok) throw new Error(data.error || "Analysis failed. Please try again.");
      if (!data.setup || !data.analysis) throw new Error("The scanner returned an incomplete result. Please retry.");
      setSetup(data.setup);
      setModelName(data.model || "Vision model");
      const saved: SavedScan = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        symbol,
        timeframe,
        model: data.model || "Vision model",
        analysis: data.analysis,
      };
      const previous = readLocalList<SavedScan>(SCAN_STORAGE_KEY);
      writeLocalList(SCAN_STORAGE_KEY, [saved, ...previous].slice(0, 50));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const decisionClass = setup?.decision === "BUY"
    ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200"
    : setup?.decision === "SELL"
      ? "border-rose-300/25 bg-rose-300/[0.08] text-rose-200"
      : "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto px-3 pb-28 pt-5 sm:px-6 sm:pb-10 lg:px-9 lg:pt-8">
        <div className="mx-auto max-w-[1500px]">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">OEM+ / Intelligence</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="page-title">Chart Scanner</h1>
                <span className="status-neutral">V2 · Vision AI</span>
              </div>
              <p className="page-subtitle mt-1 max-w-2xl">Read the chart. Weigh the evidence. Keep control of every trade.</p>
            </div>
            <Link href="/history" className="btn-secondary text-xs">Scan history <span aria-hidden="true">↗</span></Link>
          </header>

          <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
            <div className="panel-soft p-3"><p className="eyebrow">Markets</p><p className="mt-1 text-xs font-semibold text-white sm:text-sm">Forex + Gold</p></div>
            <div className="panel-soft p-3"><p className="eyebrow">Execution</p><p className="mt-1 text-xs font-semibold text-white sm:text-sm">Manual MT5</p></div>
            <div className="panel-soft p-3"><p className="eyebrow">Analysis</p><p className="mt-1 text-xs font-semibold text-white sm:text-sm">Evidence-led</p></div>
            <div className="panel-soft hidden p-3 sm:block"><p className="eyebrow">Live feed</p><p className="mt-1 text-xs font-semibold text-amber-200">Not connected</p></div>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(340px,.82fr)_minmax(0,1.18fr)]">
            <section className="panel p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><p className="eyebrow">Step 01</p><h2 className="section-title mt-1">Chart input</h2></div>
                <span className="text-[10px] text-slate-500">PNG · JPG · WEBP</span>
              </div>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]); }}
                className={`chart-dropzone flex min-h-56 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed transition sm:min-h-72 ${dragging ? "border-white/60 bg-white/10" : "border-white/15 bg-black/20 hover:border-white/35"}`}
                aria-label="Upload a chart screenshot"
              >
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="Selected trading chart preview" className="max-h-[390px] max-w-full object-contain" />
                ) : (
                  <div className="px-5 py-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-2xl text-slate-200">＋</div>
                    <p className="mt-4 text-sm font-medium text-white">Upload your MT5 chart</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">Tap to browse or drag an image here. Use a clear screenshot with visible prices and timeframe.</p>
                  </div>
                )}
              </button>
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectFile(event.target.files?.[0])} className="hidden" />
              <input ref={cameraInputRef} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={(event) => selectFile(event.target.files?.[0])} className="hidden" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary">Browse files</button>
                <button type="button" onClick={() => cameraInputRef.current?.click()} className="btn-secondary">Take photo</button>
              </div>
              {file && <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] px-3 py-2 text-xs"><span className="min-w-0 truncate text-slate-400">{file.name}</span><button type="button" onClick={() => { setFile(null); setImagePreview(null); setSetup(null); setError(null); }} className="shrink-0 text-slate-300 hover:text-white">Remove</button></div>}

              <div className="mt-5 grid grid-cols-2 gap-3">
                <label className="field-label">Instrument
                  <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, ""))} maxLength={20} placeholder="EURUSD" className="field-control mt-2" />
                </label>
                <label className="field-label">Timeframe
                  <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} className="field-control mt-2">
                    {TIMEFRAMES.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
              </div>
              <label className="field-label mt-4 block">Trading context <span className="font-normal text-slate-600">· optional</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} placeholder="Session, higher-timeframe bias, levels you are watching…" className="field-control mt-2 min-h-24 resize-y" />
              </label>
              <button type="button" onClick={analyze} disabled={!file || analyzing || !symbol.trim()} className="btn-primary mt-5 w-full py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-45">
                {analyzing ? "Reading chart evidence…" : "Analyse chart"}
              </button>
              <p className="mt-3 text-center text-[10px] leading-4 text-slate-600">Image-based analysis only · No live prices · No automatic orders</p>
            </section>

            <section className="panel min-h-[540px] p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div><p className="eyebrow">Step 02</p><h2 className="section-title mt-1">Trade assessment</h2></div>
                {modelName && <span className="status-neutral max-w-full truncate">{modelName}</span>}
              </div>

              {!setup && !analyzing && !error && <div className="flex min-h-[420px] flex-col items-center justify-center px-5 text-center">
                <div className="platinum-mark flex h-16 w-16 items-center justify-center rounded-full text-2xl font-light italic text-white">O</div>
                <h3 className="mt-5 text-sm font-semibold text-white">Your assessment appears here</h3>
                <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">Upload a chart to receive a BUY, SELL or NO TRADE assessment with levels, invalidation, evidence and uncertainty. Unreadable prices remain blank.</p>
              </div>}

              {analyzing && <div className="flex min-h-[420px] flex-col items-center justify-center gap-4">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200/20 border-t-slate-100" />
                <div className="text-center"><p className="text-sm font-medium text-white">Reviewing chart evidence</p><p className="mt-1 text-xs text-slate-500">Checking structure, levels, direction and uncertainty…</p></div>
              </div>}

              {error && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200"><p className="font-semibold">Analysis unavailable</p><p className="mt-1 text-xs leading-5">{error}</p></div>}

              {setup && <div className="space-y-4">
                <div className={`rounded-2xl border p-4 sm:p-5 ${decisionClass}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] opacity-70">Scanner decision</p><p className="mt-1 text-3xl font-semibold tracking-tight">{setup.decision}</p></div>
                    <div className="text-right"><p className="text-[10px] uppercase tracking-[.15em] opacity-70">Order type</p><p className="mt-1 text-sm font-semibold">{setup.orderType}</p></div>
                  </div>
                  <p className="mt-3 text-xs leading-5 opacity-85">{setup.summary}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-current/10 pt-3">
                    <span className="text-[10px] uppercase tracking-wider opacity-70">Analytical confidence</span>
                    <span className="text-sm font-semibold tabular-nums">{setup.confidence}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-current/80" style={{ width: `${setup.confidence}%` }} /></div>
                  <p className="mt-2 text-[10px] opacity-65">Evidence-strength estimate, not a probability of profit.</p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="eyebrow">Entry low</p><p className="mt-2 break-words text-sm font-semibold text-white">{priceLabel(setup.entry.low)}</p></div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="eyebrow">Entry high</p><p className="mt-2 break-words text-sm font-semibold text-white">{priceLabel(setup.entry.high)}</p></div>
                  <div className="rounded-xl border border-rose-300/10 bg-rose-300/[0.035] p-3"><p className="eyebrow">Stop loss</p><p className="mt-2 break-words text-sm font-semibold text-rose-100">{priceLabel(setup.stopLoss.price)}</p></div>
                  <div className="rounded-xl border border-emerald-300/10 bg-emerald-300/[0.035] p-3"><p className="eyebrow">Chart quality</p><p className="mt-2 text-sm font-semibold text-white">{setup.dataQuality}</p></div>
                </div>
                <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-5 text-slate-400"><span className="font-semibold text-slate-200">Entry logic:</span> {setup.entry.rationale}</p>

                <section className="rounded-xl border border-white/[0.07] p-4">
                  <div className="flex items-center justify-between gap-3"><h3 className="text-[11px] font-semibold uppercase tracking-[.15em] text-slate-300">Profit targets</h3><span className="text-[10px] text-slate-500">Conditional levels</span></div>
                  {setup.targets.length ? <div className="mt-3 grid gap-2 sm:grid-cols-3">{setup.targets.map((target, index) => <div key={index} className="rounded-lg bg-white/[0.025] p-3"><p className="eyebrow">Target {index + 1}</p><p className="mt-1 text-sm font-semibold text-emerald-100">{priceLabel(target.price)}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{target.rationale}</p></div>)}</div> : <p className="mt-3 text-xs text-slate-500">No defensible target could be read.</p>}
                  <p className="mt-3 text-xs leading-5 text-slate-400"><span className="font-semibold text-slate-200">Stop rationale:</span> {setup.stopLoss.rationale}</p>
                  <p className="mt-2 text-xs text-slate-400"><span className="font-semibold text-slate-200">Risk/reward:</span> {setup.riskReward ?? "Not calculated from the visible chart."}</p>
                </section>

                <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[.15em] text-amber-100">Invalidation condition</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-300">{setup.invalidation}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <EvidenceList title="Supporting evidence" items={setup.supportingEvidence} tone="positive" />
                  <EvidenceList title="Opposing evidence" items={setup.opposingEvidence} tone="negative" />
                  <EvidenceList title="Confirmation needed" items={setup.confirmations} />
                  <EvidenceList title="Uncertainty / missing data" items={setup.uncertainties} tone="negative" />
                </div>
                <div className="rounded-lg border border-white/[0.06] px-3 py-2 text-[10px] leading-5 text-slate-500">Verify every level on your live MT5 chart before making a decision. This image analysis is not live market data or financial advice. You remain responsible for all manual execution.</div>
              </div>}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
