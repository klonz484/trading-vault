"use client";

import { useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";

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
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectFile = (selected: File | undefined) => {
    if (!selected) return;
    setError(null);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 p-5 lg:p-8 overflow-y-auto">
        <div className="mb-7">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-white tracking-tight">AI Chart Scanner</h1>
            <span className="text-[10px] uppercase tracking-wider text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 rounded-full px-2.5 py-1">Vision AI</span>
          </div>
          <p className="text-sm text-[var(--muted)] mt-1">Upload an MT5 screenshot for a structured, image-based technical read.</p>
        </div>

        <div className="grid xl:grid-cols-2 gap-6 max-w-7xl">
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
            {file && <div className="flex items-center justify-between gap-3 mt-2 text-xs text-[var(--muted)]"><span className="truncate">{file.name}</span><button onClick={() => { setFile(null); setImagePreview(null); setResult(null); setError(null); }} className="text-cyan-300 hover:text-cyan-200">Remove</button></div>}

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
              <h2 className="font-medium text-white">Analysis</h2>
              {modelName && <span className="text-[10px] text-cyan-300 border border-cyan-500/30 rounded-full px-2 py-1">{modelName}</span>}
            </div>
            {!result && !analyzing && !error && <div className="min-h-[330px] flex flex-col items-center justify-center text-center text-[var(--muted)] text-sm"><div className="text-3xl text-cyan-400/40 mb-3">⌁</div><p>Your chart read will appear here.</p><p className="text-xs mt-2 max-w-xs">The model will separate visible evidence from interpretation and flag anything it cannot read.</p></div>}
            {analyzing && <div className="min-h-[330px] flex flex-col items-center justify-center gap-3"><div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"/><p className="text-sm text-[var(--muted)]">Inspecting market structure, levels and chart context…</p></div>}
            {error && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"><p className="font-medium mb-1">Analysis unavailable</p>{error}</div>}
            {result && <div className="whitespace-pre-wrap text-sm text-[var(--foreground)] leading-7">{result}</div>}
          </section>
        </div>

        <div className="mt-6 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]/50 max-w-7xl">
          <p className="text-xs text-[var(--muted)] leading-5"><span className="text-cyan-400">Model:</span> Groq-hosted Qwen 3.8 27B Vision. It accepts image and text inputs; free-tier usage is subject to account rate limits and model availability. Your API key stays on the server and is never sent to the browser.</p>
          <p className="text-xs text-[var(--muted)] leading-5 mt-2">Trading risk notice: image-based chart reads can be wrong or miss context. Treat outputs as research support, verify every level in MT5, and make all execution decisions manually.</p>
        </div>
      </main>
    </div>
  );
}
