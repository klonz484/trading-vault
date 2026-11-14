"use client";

import { useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import { readLocalList, SavedScan, SCAN_STORAGE_KEY, structureScanAnalysis, writeLocalList } from "@/lib/workspace";

type AnalysisResponse = { analysis?: string; model?: string; error?: string };

export default function ScannerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("H1");
  const [notes, setNotes] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const selectFile = (selected: File | undefined) => {
    if (!selected) return;
    setError(null);
    setSaveWarning(null);
    setResult(null);
    setModelName(null);
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
    setSaveWarning(null);
    setResult(null);
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
      const analysis = data.analysis || "";
      const structured = structureScanAnalysis(analysis);
      const saved: SavedScan = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), symbol, timeframe, model: data.model || "Vision model", analysis, schemaVersion: 2, revision: 1, summary: structured.summary, sections: structured.sections };
      try {
        const previous = readLocalList<SavedScan>(SCAN_STORAGE_KEY);
        writeLocalList(SCAN_STORAGE_KEY, [saved, ...previous].slice(0, 50));
      } catch {
        setSaveWarning("Analysis completed, but this browser could not save it to scan history. You can still review the result now.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8"><div className="mx-auto max-w-[1500px]">
        <div className="mb-7">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title">AI Chart Scanner</h1>
            <span className="status-neutral">Vision AI</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3"><p className="page-subtitle mt-1">Upload an MT5 screenshot for a structured, image-based technical read. Evidence first. Manual decisions always.</p><Link href="/history" className="text-xs text-slate-300 hover:text-white">View scan history →</Link></div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="panel-soft p-3"><p className="eyebrow">Workflow</p><p className="text-sm font-semibold text-white">Upload chart</p></div><div className="panel-soft p-3"><p className="eyebrow">Markets</p><p className="text-sm font-semibold text-white">Forex + Gold</p></div><div className="panel-soft p-3"><p className="eyebrow">Execution</p><p className="text-sm font-semibold text-white">Manual MT5</p></div><div className="panel-soft p-3"><p className="eyebrow">Output</p><p className="text-sm font-semibold text-white">Evidence-led read</p></div></div><div className="grid xl:grid-cols-[1.05fr_.95fr] gap-5">
          <section className="panel p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="section-title">Chart input</h2><p className="mt-1 text-xs text-slate-500">Choose a clear MT5 chart screenshot.</p></div><span className="status-neutral">Step 01</span></div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]); }}
              className={`chart-dropzone flex flex-col items-center justify-center w-full min-h-64 max-h-[440px] border-2 border-dashed rounded-2xl overflow-hidden transition-all ${dragging ? "border-slate-200 bg-white/10" : "border-[var(--border)] hover:border-white/50 hover:bg-[var(--card-hover)]"}`}
            >
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="Selected trading chart" className="max-h-[400px] max-w-full object-contain" />
              ) : (
                <div className="text-center px-5 py-12">
                  <div className="text-4xl text-slate-200/70 mb-3">▧</div>
                  <p className="text-sm text-white">Drop your chart screenshot here</p>
                  <p className="text-xs text-[var(--muted)] mt-2">or tap to browse · PNG, JPG, WebP · max 10 MB</p>
                </div>
              )}
            </button>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectFile(event.target.files?.[0])} className="hidden" />
            <input ref={cameraInputRef} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={(event) => selectFile(event.target.files?.[0])} className="hidden" />
            <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary">Browse files</button><button type="button" onClick={() => cameraInputRef.current?.click()} className="btn-secondary">Take photo</button></div>
            {file && <div className="flex items-center justify-between gap-3 mt-2 text-xs text-[var(--muted)]"><span className="truncate">{file.name}</span><button onClick={() => { setFile(null); setImagePreview(null); setResult(null); setError(null); }} className="text-slate-300 hover:text-white">Remove</button></div>}

            <div className="grid sm:grid-cols-2 gap-3 mt-5">
              <label className="field-label">Instrument
                <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} maxLength={30} placeholder="e.g. EURUSD" className="field-control" />
              </label>
              <label className="field-label">Timeframe
                <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} className="field-control">
                  {["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1", "Not sure"].map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <label className="field-label mt-3">Your context (optional)
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} placeholder="e.g. Looking for a pullback entry; mark the London session high if visible." className="field-control min-h-[96px] resize-y" />
            </label>
            <button onClick={analyze} disabled={!file || analyzing} className="btn-primary mt-5 w-full py-3.5 text-sm">
              {analyzing ? "Reading chart..." : "Run AI Analysis"}
            </button>
          </section>

          <section className="panel min-h-[480px] p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div><h2 className="section-title">Analysis</h2><p className="mt-1 text-xs text-slate-500">Evidence, interpretation and uncertainty.</p></div>
              {modelName && <span className="status-neutral">{modelName}</span>}
            </div>
            {!result && !analyzing && !error && <div className="min-h-[330px] flex flex-col items-center justify-center text-center text-[var(--muted)] text-sm"><div className="text-3xl text-slate-200/40 mb-3">⌁</div><p>Your chart read will appear here.</p><p className="text-xs mt-2 max-w-xs">The model will separate visible evidence from interpretation and flag anything it cannot read. Successful reads are saved to local scan history.</p></div>}
            {analyzing && <div className="min-h-[330px] flex flex-col items-center justify-center gap-3"><div className="w-8 h-8 border-2 border-slate-200 border-t-transparent rounded-full animate-spin"/><p className="text-sm text-[var(--muted)]">Inspecting market structure, levels and chart context…</p></div>}
            {error && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"><p className="font-medium mb-1">Analysis unavailable</p>{error}</div>}
            {saveWarning && <div role="status" className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">{saveWarning}</div>}
            {result && <div className="whitespace-pre-wrap text-sm text-[var(--foreground)] leading-7">{result}</div>}
          </section>
        </div>

        <div className="mt-5 panel-soft p-4 sm:p-5">
          <p className="text-xs text-[var(--muted)] leading-5"><span className="text-slate-200">Model:</span> Groq-hosted Qwen 3.8 27B Vision. It accepts image and text inputs; free-tier usage is subject to account rate limits and model availability. Your API key stays on the server and is never sent to the browser.</p>
          <p className="text-xs text-[var(--muted)] leading-5 mt-2">Trading risk notice: image-based chart reads can be wrong or miss context. Treat outputs as research support, verify every level in MT5, and make all execution decisions manually.</p>
        </div>
      </div></main>
    </div>
  );
}
