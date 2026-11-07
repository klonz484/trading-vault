"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";

type Field<T> = { value: T | null; confidence: number; source: string; status: "observed" | "uncertain" | "unavailable" };
type Observation = {
  scanId: string;
  receivedAtUtc: string;
  image: { sha256: string; mimeType: string; byteLength: number };
  screenType: Field<string>;
  instrument: Field<string>;
  timeframe: Field<string>;
  bid: Field<number>;
  ask: Field<number>;
  spread: Field<number>;
  marketStatus: Field<string>;
  timestamps: { deviceTime: Field<string>; chartOrBrokerTime: Field<string>; lastCandleTime: Field<string>; receiptTimeUtc: string; timezoneOrBrokerOffset: Field<string> };
  marketLocation: { description: Field<string>; visibleLevels: Array<{ label: string; price: number | null; confidence: number }>; visibleFeatures: string[] };
  userContext: { instrument: string; timeframe: string; notes: string };
  quality: { rating: string; warnings: string[] };
  packetStatus: "COMPLETE" | "INCOMPLETE";
  missingCriticalFields: string[];
  contextOnlyNotSignal: true;
};
type ApiResponse = { observation?: Observation; brainStatus?: string; message?: string; model?: string; error?: string };

const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1", "Not sure"];
const display = (value: string | number | null | undefined) => value === null || value === undefined || value === "" ? "Not readable" : String(value);
function FieldCard({ label, field }: { label: string; field: Field<string | number> }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
    <p className="eyebrow">{label}</p>
    <p className="mt-2 break-words text-sm font-semibold text-white">{display(field.value)}</p>
    <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{field.status} · {Math.round(field.confidence * 100)}% field confidence</p>
  </div>;
}
export default function ScannerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("H1");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [observation, setObservation] = useState<Observation | null>(null);
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const chooseFile = (next?: File) => {
    if (!next) return;
    setError(""); setObservation(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(next.type)) { setError("Choose a PNG, JPG or WebP image."); return; }
    if (next.size < 1 || next.size > 10 * 1024 * 1024) { setError("Image must be between 1 byte and 10 MB."); return; }
    setFile(next);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(next);
  };
  const scan = async () => {
    if (!file || busy) return;
    setBusy(true); setError(""); setObservation(null);
    try {
      const form = new FormData();
      form.append("image", file); form.append("symbol", symbol); form.append("timeframe", timeframe); form.append("notes", notes);
      const response = await fetch("/api/scanner/analyze", { method: "POST", body: form });
      const data = await response.json() as ApiResponse;
      if (!response.ok) throw new Error(data.error || "Chart reading failed.");
      if (!data.observation) throw new Error("The Scanner returned no valid observation packet.");
      setObservation(data.observation); setModel(data.model || "Vision model");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read this chart."); }
    finally { setBusy(false); }
  };

  return <div className="min-h-screen md:flex">
    <Sidebar />
    <main className="min-w-0 flex-1 overflow-y-auto px-3 pb-28 pt-5 sm:px-6 sm:pb-10 lg:px-9 lg:pt-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div><p className="eyebrow">OEM+ / Perception layer</p><div className="mt-1 flex items-center gap-2"><h1 className="page-title">Chart Scanner</h1><span className="status-neutral">V2 · Observation only</span></div><p className="page-subtitle mt-1 max-w-2xl">Capture what is visible. The Trading Brain—not the Scanner—will perform the analysis.</p></div>
          <Link href="/history" className="btn-secondary text-xs">Scan history <span aria-hidden="true">↗</span></Link>
        </header>

        <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
          <div className="panel-soft p-3"><p className="eyebrow">Coverage</p><p className="mt-2 text-sm font-semibold text-white">Forex + Gold</p></div>
          <div className="panel-soft p-3"><p className="eyebrow">Execution</p><p className="mt-2 text-sm font-semibold text-white">Manual MT5</p></div>
          <div className="panel-soft p-3"><p className="eyebrow">Live data</p><p className="mt-2 text-sm font-semibold text-amber-200">Not connected</p></div>
          <div className="panel-soft hidden p-3 sm:block"><p className="eyebrow">Brain</p><p className="mt-2 text-sm font-semibold text-amber-200">Not connected</p></div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <section className="panel p-4 sm:p-5">
            <div className="mb-4"><p className="eyebrow">Step 01</p><h2 className="section-title mt-1">Chart intake</h2><p className="mt-1 text-xs text-slate-500">MT5 mobile screenshots first. Keep the price axis, symbol and timeframe visible.</p></div>
            <button type="button" onClick={() => fileRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files?.[0]); }} className={`chart-dropzone flex min-h-56 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed transition sm:min-h-72 ${dragging ? "border-white/60 bg-white/10" : "border-white/15 bg-black/20 hover:border-white/35"}`} aria-label="Upload chart screenshot">
              {preview ? <img src={preview} alt="Selected chart preview" className="max-h-[390px] max-w-full object-contain" /> : <div className="px-5 py-10 text-center"><div className="platinum-mark mx-auto flex h-12 w-12 items-center justify-center rounded-full text-2xl font-light italic text-white">O</div><p className="mt-4 text-sm font-medium text-white">Upload your MT5 chart</p><p className="mt-2 text-xs leading-5 text-slate-500">Tap to browse or drag an image here.</p></div>}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => chooseFile(e.target.files?.[0])} className="hidden" />
            <input ref={cameraRef} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={e => chooseFile(e.target.files?.[0])} className="hidden" />
            <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary">Browse files</button><button type="button" onClick={() => cameraRef.current?.click()} className="btn-secondary">Take photo</button></div>
            {file && <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] px-3 py-2 text-xs"><span className="min-w-0 truncate text-slate-400">{file.name}</span><button type="button" onClick={() => { setFile(null); setPreview(null); setObservation(null); }} className="text-slate-300">Remove</button></div>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="field-label">Instrument<input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, ""))} maxLength={20} className="field-control mt-2" placeholder="EURUSD" /></label>
              <label className="field-label">Timeframe<select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="field-control mt-2">{TIMEFRAMES.map(v => <option key={v}>{v}</option>)}</select></label>
            </div>
            <label className="field-label mt-4 block">Context notes <span className="font-normal text-slate-600">· optional, stored as user input</span><textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={3} className="field-control mt-2 min-h-24 resize-y" placeholder="Any context you want attached to this screenshot…" /></label>
            <button type="button" onClick={scan} disabled={!file || busy || !symbol.trim()} className="btn-primary mt-5 w-full py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-45">{busy ? "Extracting visible facts…" : "Capture chart observations"}</button>
            <p className="mt-3 text-center text-[10px] leading-4 text-slate-600">No trade analysis · No live market data · No automatic orders</p>
          </section>

          <section className="panel min-h-[540px] p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow">Step 02</p><h2 className="section-title mt-1">Observation packet</h2></div>{model && <span className="status-neutral">{model}</span>}</div>
            {!observation && !busy && !error && <div className="flex min-h-[420px] flex-col items-center justify-center px-5 text-center"><div className="platinum-mark flex h-16 w-16 items-center justify-center rounded-full text-2xl font-light italic text-white">O</div><h3 className="mt-5 text-sm font-semibold text-white">No observations captured yet</h3><p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">The Scanner extracts visible chart facts only. The Brain will later validate those facts against live market data and perform the analysis.</p></div>}
            {busy && <div className="flex min-h-[420px] flex-col items-center justify-center gap-4"><div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200/20 border-t-slate-100" /><p className="text-sm text-white">Reading visible chart details…</p></div>}
            {error && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200"><p className="font-semibold">Observation unavailable</p><p className="mt-1 text-xs leading-5">{error}</p></div>}
            {observation && <div className="space-y-4">
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.045] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-amber-100">Context only · Not a signal</p><span className="text-[10px] text-amber-100">{observation.packetStatus}</span></div><p className="mt-2 text-xs leading-5 text-slate-300">Trading Brain status: not connected. No BUY, SELL, entry, stop loss or target has been generated.</p></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><FieldCard label="Instrument · screenshot" field={observation.instrument} /><FieldCard label="Timeframe · screenshot" field={observation.timeframe} /><FieldCard label="Screen type" field={observation.screenType} /><FieldCard label="Bid" field={observation.bid} /><FieldCard label="Ask" field={observation.ask} /><FieldCard label="Spread" field={observation.spread} /></div>
              <div className="rounded-xl border border-white/[0.07] p-4"><p className="eyebrow">Visible chart description</p><p className="mt-2 text-xs leading-5 text-slate-300">{display(observation.marketLocation.description.value)}</p>{observation.marketLocation.visibleFeatures.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-400">{observation.marketLocation.visibleFeatures.map((v,i) => <li key={i}>{v}</li>)}</ul>}</div>
              <div className="rounded-xl border border-white/[0.07] p-4"><p className="eyebrow">Visible levels · no inferred levels</p>{observation.marketLocation.visibleLevels.length ? <div className="mt-2 space-y-2">{observation.marketLocation.visibleLevels.map((v,i) => <div key={i} className="flex justify-between gap-3 text-xs"><span className="text-slate-400">{v.label}</span><span className="text-white">{display(v.price)}</span></div>)}</div> : <p className="mt-2 text-xs text-slate-500">No readable level labels were extracted.</p>}</div>
              <div className="grid grid-cols-2 gap-2"><FieldCard label="Device time" field={observation.timestamps.deviceTime} /><FieldCard label="Chart / broker time" field={observation.timestamps.chartOrBrokerTime} /><FieldCard label="Last candle time" field={observation.timestamps.lastCandleTime} /><FieldCard label="Timezone / offset" field={observation.timestamps.timezoneOrBrokerOffset} /></div>
              <div className="rounded-xl border border-white/[0.07] p-4"><div className="flex justify-between gap-2"><p className="eyebrow">Image quality</p><p className="text-xs text-white">{observation.quality.rating}</p></div>{observation.quality.warnings.length ? <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-100">{observation.quality.warnings.map((v,i) => <li key={i}>{v}</li>)}</ul> : <p className="mt-2 text-xs text-slate-500">No image-quality warnings returned.</p>}{observation.missingCriticalFields.length > 0 && <p className="mt-3 text-xs text-rose-200">Missing critical fields: {observation.missingCriticalFields.join(", ")}</p>}</div>
              <div className="rounded-lg border border-white/[0.06] px-3 py-2 text-[10px] leading-5 text-slate-500">Received {new Date(observation.receivedAtUtc).toLocaleString()} · SHA-256 {observation.image.sha256.slice(0,16)}… · User-entered context is kept separate from screenshot observations. Live MT5 verification and Brain analysis are not yet active.</div>
            </div>}
          </section>
        </div>
      </div>
    </main>
  </div>;
}
