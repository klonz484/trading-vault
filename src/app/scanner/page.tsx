"use client";

import { useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import { readLocalList, SavedScan, SCAN_STORAGE_KEY, writeLocalList } from "@/lib/workspace";
import { parseScannerSummary, type ScannerSummary } from "@/lib/scanner/summary";

type AnalysisResponse = { analysis?: string; model?: string; error?: string; status?: "completed" | "incomplete"; warning?: string | null; setupSummary?: ScannerSummary };
const instruments = ["EURUSD", "XAUUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD"];
const timeframes = ["M5", "M15", "M30", "H1", "H4", "D1", "W1", "Not sure"];

export default function ScannerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("H1");
  const [notes, setNotes] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [summary, setSummary] = useState<ScannerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const selectFile = (selected: File | undefined) => {
    if (!selected) return;
    setError(null); setResult(null); setModelName(null); setSummary(null);
    if (!(["image/png", "image/jpeg", "image/webp"].includes(selected.type))) {
      setError("Please choose a PNG, JPG, or WebP image."); return;
    }
    if (selected.size < 1 || selected.size > 10 * 1024 * 1024) {
      setError("Choose an image smaller than 10 MB."); return;
    }
    setFile(selected);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(selected);
  };

  const analyze = async () => {
    if (!file || analyzing) return;
    setAnalyzing(true); setError(null); setResult(null);
    try {
      const body = new FormData();
      body.append("image", file); body.append("symbol", symbol); body.append("timeframe", timeframe); body.append("notes", notes);
      const response = await fetch("/api/scanner/analyze", { method: "POST", body });
      const data = (await response.json()) as AnalysisResponse;
      if (!response.ok) throw new Error(data.error || "Analysis failed. Please try again.");
      const analysis = data.analysis || "The model did not return an analysis.";
      const model = data.model || "Vision model";
      setResult(analysis); setModelName(model);
      const parsedSummary = data.setupSummary ?? parseScannerSummary(analysis);
      setSummary(data.status === "incomplete"
        ? { ...parseScannerSummary(""), reason: data.warning || "This scan did not finish normally. Treat it as NO TRADE and run a fresh scan." }
        : parsedSummary);
      const saved: SavedScan = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), symbol, timeframe, model, analysis };
      writeLocalList(SCAN_STORAGE_KEY, [saved, ...readLocalList<SavedScan>(SCAN_STORAGE_KEY)].slice(0, 50));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally { setAnalyzing(false); }
  };

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto px-3 pb-28 pt-4 sm:px-6 sm:pb-10 lg:px-9 lg:pt-8">
        <div className="mx-auto max-w-[1380px]">
          <header className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-7">
            <div>
              <p className="eyebrow">OEM+ / Perception studio</p>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="page-title">Chart Scanner</h1>
                <span className="status-neutral">Vision AI</span>
              </div>
              <p className="page-subtitle mt-1">Upload a chart. Capture the evidence. Review the read.</p>
            </div>
            <Link href="/scanner/history" className="btn-secondary text-xs">Private scan history <span aria-hidden="true">↗</span></Link>
          </header>

          <section className="panel relative mb-4 overflow-hidden p-4 sm:mb-5 sm:p-5">
            <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full border border-white/[0.07]" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="platinum-mark flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl font-light italic text-white">O</span>
                <div><p className="platinum-text text-lg font-light italic tracking-tight">OEM+</p><p className="text-[9px] uppercase tracking-[.22em] text-slate-500">ChartScanner</p></div>
              </div>
              <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 sm:max-w-[480px]">
                <div className="panel-soft rounded-xl p-2.5"><p className="eyebrow">Markets</p><p className="text-xs font-semibold text-white sm:text-sm">Forex + Gold</p></div>
                <div className="panel-soft rounded-xl p-2.5"><p className="eyebrow">Execution</p><p className="text-xs font-semibold text-white sm:text-sm">Manual MT5</p></div>
                <div className="panel-soft rounded-xl p-2.5"><p className="eyebrow">Workflow</p><p className="text-xs font-semibold text-white sm:text-sm">Image read</p></div>
              </div>
            </div>
          </section>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div><p className="eyebrow">Your workspace</p><h2 className="section-title">New chart analysis</h2></div>
            <span className="status-neutral">Step 01 of 02</span>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="panel min-w-0 p-3.5 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div><h3 className="section-title">Chart upload</h3><p className="mt-1 text-xs text-slate-500">Use a clear MT5 screenshot with the price scale visible.</p></div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">01 / Input</span>
              </div>

              <button type="button" onClick={() => inputRef.current?.click()}
                onDragOver={event => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={event => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]); }}
                className={`chart-dropzone flex min-h-[220px] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed transition sm:min-h-[300px] ${dragging ? "border-white/70 bg-white/10" : "border-white/15 hover:border-white/35"}`}
                aria-label="Upload trading chart screenshot">
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="Selected trading chart preview" className="max-h-[420px] max-w-full object-contain" />
                ) :
                  <div className="px-5 py-9 text-center">
                    <span className="platinum-mark mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl font-light italic text-white">O</span>
                    <p className="mt-4 text-sm font-medium text-white">Drop your chart here</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Tap to browse or choose camera below</p>
                    <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-600">PNG · JPG · WEBP · MAX 10 MB</p>
                  </div>}
              </button>
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => selectFile(event.target.files?.[0])} className="hidden" />
              <input ref={cameraInputRef} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={event => selectFile(event.target.files?.[0])} className="hidden" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary w-full">Browse files</button>
                <button type="button" onClick={() => cameraInputRef.current?.click()} className="btn-secondary w-full">Take photo</button>
              </div>
              {file && <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] px-3 py-2 text-xs"><span className="min-w-0 truncate text-slate-400">{file.name}</span><button type="button" onClick={() => { setFile(null); setImagePreview(null); setResult(null); setError(null); }} className="shrink-0 text-slate-300 hover:text-white">Remove</button></div>}

              <div className="mt-5 grid grid-cols-2 gap-3">
                <label className="field-label">Instrument
                  <select value={symbol} onChange={event => setSymbol(event.target.value)} className="field-control mt-2">
                    {instruments.map(value => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="field-label">Timeframe
                  <select value={timeframe} onChange={event => setTimeframe(event.target.value)} className="field-control mt-2">
                    {timeframes.map(value => <option key={value}>{value}</option>)}
                  </select>
                </label>
              </div>
              <label className="field-label mt-4 block">Context notes <span className="font-normal text-slate-600">· optional</span>
                <textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} rows={3} placeholder="Add session context or what you want the model to pay attention to…" className="field-control mt-2 min-h-24 resize-y" />
              </label>
              {error && <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-xs leading-5 text-rose-200">{error}</div>}
              <button type="button" onClick={analyze} disabled={!file || analyzing} className="btn-primary mt-4 min-h-12 w-full text-sm disabled:cursor-not-allowed disabled:opacity-45">
                {analyzing ? "Reading your chart…" : "Run chart analysis"}
              </button>
              <p className="mt-3 text-center text-[10px] leading-4 text-slate-600">Research support only · Verify levels in MT5 · No automatic orders</p>
            </section>

            <section className="panel min-w-0 p-3.5 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><p className="eyebrow">Step 02</p><h3 className="section-title mt-1">Analysis results</h3><p className="mt-1 text-xs text-slate-500">Evidence, interpretation and uncertainty.</p></div>
                {modelName && <span className="status-neutral max-w-[45%] truncate">{modelName}</span>}
              </div>
              {!result && !analyzing && !error && <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-5 py-10 text-center sm:min-h-[420px]">
                <span className="platinum-mark flex h-14 w-14 items-center justify-center rounded-full text-2xl font-light italic text-white">O</span>
                <h4 className="mt-4 text-sm font-medium text-white">Your chart read appears here</h4>
                <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">Upload a chart and start the analysis. The model should distinguish visible evidence from interpretation and flag uncertainty.</p>
              </div>}
              {analyzing && <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 sm:min-h-[420px]"><div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200/20 border-t-slate-100" /><p className="text-sm text-slate-300">Inspecting chart structure and visible levels…</p></div>}
              {error && !analyzing && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200"><p className="font-semibold">Analysis unavailable</p><p className="mt-1 text-xs leading-5">{error}</p></div>}
              {summary && <div className={`mb-4 rounded-xl border p-4 sm:p-5 ${summary.decision === "BUY" ? "border-emerald-400/30 bg-emerald-400/[0.06]" : summary.decision === "SELL" ? "border-rose-400/30 bg-rose-400/[0.06]" : "border-white/10 bg-white/[0.03]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-[10px] uppercase tracking-[.18em] text-slate-500">Trading decision</p><h4 className="mt-1 text-3xl font-semibold tracking-tight text-white">{summary.decision}</h4></div>
                  {summary.orderType !== "NONE" && <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold tracking-wider text-slate-200">{summary.orderType} ORDER</span>}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{summary.reason}</p>
                {summary.decision !== "NO TRADE" && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="panel-soft rounded-lg p-3"><p className="eyebrow">Entry</p><p className="mt-1 break-words text-sm font-semibold text-white">{summary.entryType === "range" ? `${summary.entryLow} – ${summary.entryHigh}` : summary.entry ?? "—"}</p></div>
                  <div className="panel-soft rounded-lg p-3"><p className="eyebrow">Stop loss</p><p className="mt-1 break-words text-sm font-semibold text-rose-200">{summary.stopLoss ?? "—"}</p></div>
                  <div className="panel-soft rounded-lg p-3"><p className="eyebrow">Take profit 1</p><p className="mt-1 break-words text-sm font-semibold text-emerald-200">{summary.takeProfit1 ?? "—"}</p></div>
                  {summary.takeProfit2 !== null && <div className="panel-soft rounded-lg p-3"><p className="eyebrow">Take profit 2</p><p className="mt-1 text-sm font-semibold text-emerald-200">{summary.takeProfit2}</p></div>}
                  {summary.takeProfit3 !== null && <div className="panel-soft rounded-lg p-3"><p className="eyebrow">Take profit 3</p><p className="mt-1 text-sm font-semibold text-emerald-200">{summary.takeProfit3}</p></div>}
                  {summary.invalidation !== null && <div className="panel-soft rounded-lg p-3"><p className="eyebrow">Invalidation</p><p className="mt-1 text-sm font-semibold text-white">{summary.invalidation}</p></div>}
                </div>}
                <div className="mt-4 border-t border-white/[0.08] pt-3 text-[10px] leading-5 text-slate-500">Confidence: not calibrated · Technical levels: unverified · Manual MT5 execution only</div>
              </div>}
              {result && <details className="rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm leading-7 text-slate-200 sm:p-5"><summary className="cursor-pointer text-xs font-semibold uppercase tracking-[.15em] text-slate-400">View detailed chart analysis</summary><div className="mt-4 whitespace-pre-wrap">{result}</div></details>}
            </section>
          </div>

          <section className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="panel-soft p-4"><p className="text-xs font-semibold text-slate-200">Private scan history</p><p className="mt-1 text-xs leading-5 text-slate-500">Successful chart reads are saved to your private account and kept as a browser-local convenience copy.</p><Link href="/scanner/history" className="mt-3 inline-flex text-xs text-slate-300 hover:text-white">Open private history →</Link></div>
            <div className="panel-soft p-4"><p className="text-xs font-semibold text-slate-200">Manual execution</p><p className="mt-1 text-xs leading-5 text-slate-500">Image-based reads can miss context. Verify every level and make all trade decisions manually.</p></div>
          </section>
          <footer className="mt-6 border-t border-white/[0.07] pt-4 text-[10px] leading-5 text-slate-600">OEM+ ChartScanner · Groq-hosted vision model · API key remains server-side · Output is research support, not financial advice.</footer>
        </div>
      </main>
    </div>
  );
}
