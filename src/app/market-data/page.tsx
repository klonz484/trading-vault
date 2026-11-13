"use client";

import { useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";

type Instrument = "EURUSD" | "XAUUSD";
type Timeframe = "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1" | "W1";

interface MarketDataResponse {
  status: string;
  pricesAvailable?: boolean;
  message?: string;
  instrument?: string;
  timeframe?: string;
  provider?: string;
  retrievedAt?: string;
  observationCount?: number;
  eligibleObservationCount?: number;
  latestObservationAt?: string | null;
  source?: {
    symbol?: string;
    entitlementStatus?: string;
    licenceStatus?: string;
    sourceTimezone?: string;
  };
  brain?: {
    marketDataGate?: "LIVE_ELIGIBLE" | "REPLAY_ONLY" | "BLOCKED";
    status?: string;
    decision?: string;
    uncertainties?: string[];
    sourceReferences?: string[];
  };
  validation?: {
    status?: string;
    checkedAt?: string;
    candleCount?: number;
    eligibleCandleCount?: number;
    invalidCandles?: number;
    duplicateTimestamps?: string[];
    outOfOrderTimestamps?: string[];
    missingIntervals?: string[];
    futureTimestamps?: string[];
    warnings?: string[];
    errors?: string[];
    freshnessSeconds?: number | null;
    freshnessThresholdSeconds?: number | null;
  };
  candles?: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    provisional: boolean;
  }>;
  limitations?: string[];
}

function formatDate(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Invalid timestamp";
}

function statusTone(value?: string) {
  if (value === "READY" || value === "LIVE_ELIGIBLE" || value === "VERIFIED") return "status-success";
  if (value === "BLOCKED" || value === "STALE" || value === "INCOMPLETE" || value === "UNAVAILABLE") return "status-warning";
  return "status-neutral";
}

export default function MarketDataPage() {
  const [instrument, setInstrument] = useState<Instrument>("EURUSD");
  const [timeframe, setTimeframe] = useState<Timeframe>("M15");
  const [data, setData] = useState<MarketDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const checkFeed = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const response = await fetch(
        `/api/market-data?instrument=${instrument}&timeframe=${timeframe}`,
        { method: "GET", cache: "no-store" },
      );
      const payload = await response.json() as MarketDataResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || `Market-data request failed (${response.status}).`);
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Market-data request failed.");
    } finally {
      setLoading(false);
    }
  };

  const validation = data?.validation;
  const diagnostics = [
    ...(validation?.errors ?? []),
    ...(validation?.warnings ?? []),
    ...(data?.limitations ?? []),
  ];

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8">
        <div className="mx-auto max-w-[1250px]">
          <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">OEM+ / Data infrastructure</p>
              <h1 className="page-title">Market Data Monitor</h1>
              <p className="page-subtitle">Run a controlled, on-demand provider check and inspect the evidence gates before data can reach the Trading Brain.</p>
            </div>
            <Link href="/brain" className="btn-secondary">Trading Brain ↗</Link>
          </header>

          <section className="panel mb-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="section-title">Provider connection test</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Twelve Data is the current OHLC candle source. Requests run only when you press the button; this page does not poll in the background.</p>
              </div>
              <span className="status-neutral">Server-side credential</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="field-label">Instrument
                <select value={instrument} onChange={event => setInstrument(event.target.value as Instrument)} className="field-control mt-2">
                  <option value="EURUSD">EURUSD · Euro / US Dollar</option>
                  <option value="XAUUSD">XAUUSD · Gold / US Dollar</option>
                </select>
              </label>
              <label className="field-label">Timeframe
                <select value={timeframe} onChange={event => setTimeframe(event.target.value as Timeframe)} className="field-control mt-2">
                  {(["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"] as Timeframe[]).map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <button type="button" onClick={checkFeed} disabled={loading} className="btn-primary min-h-11 w-full sm:w-auto">
                {loading ? "Checking provider…" : "Check live feed"}
              </button>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-slate-600">Requests are rate-limited. Avoid repeated clicks; wait for the result before running another check.</p>
            {error && <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-xs leading-5 text-rose-200">{error}</div>}
          </section>

          {!data && !loading && !error && (
            <section className="panel flex min-h-52 flex-col items-center justify-center p-6 text-center">
              <span className="platinum-mark flex h-12 w-12 items-center justify-center rounded-full text-xl text-white">◎</span>
              <h2 className="mt-4 text-sm font-semibold text-white">No provider check run yet</h2>
              <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">Choose EURUSD or XAUUSD and a timeframe, then run a single check. The result will show connection, data-quality and Brain readiness separately.</p>
            </section>
          )}

          {loading && <section className="panel flex min-h-52 items-center justify-center p-6 text-sm text-slate-400">Requesting provider observations…</section>}

          {data && (
            <>
              <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="panel p-4"><p className="eyebrow">Provider response</p><span className={statusTone(data.status)}>{data.status}</span><p className="mt-2 text-xs text-slate-500">{data.provider ?? "Twelve Data"}</p></div>
                <div className="panel p-4"><p className="eyebrow">Data quality</p><span className={statusTone(validation?.status)}>{validation?.status ?? "Not checked"}</span><p className="mt-2 text-xs text-slate-500">{validation?.eligibleCandleCount ?? 0} eligible / {validation?.candleCount ?? 0} observations</p></div>
                <div className="panel p-4"><p className="eyebrow">Brain data gate</p><span className={statusTone(data.brain?.marketDataGate)}>{data.brain?.marketDataGate ?? "Not reached"}</span><p className="mt-2 text-xs text-slate-500">{data.brain?.decision ?? "No assessment"}</p></div>
                <div className="panel p-4"><p className="eyebrow">Prices</p><span className={data.pricesAvailable ? "status-success" : "status-warning"}>{data.pricesAvailable ? "Released" : "Withheld"}</span><p className="mt-2 text-xs text-slate-500">Prices require all release checks to pass.</p></div>
              </section>

              {data.message && <div className="panel mb-5 p-4 text-sm leading-6 text-slate-300">{data.message}</div>}

              <section className="panel mb-5 p-5 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div><h2 className="section-title">{data.instrument ?? instrument} · {data.timeframe ?? timeframe}</h2><p className="mt-1 text-xs text-slate-500">Source: {data.source?.symbol ?? "Not available"} · {data.source?.sourceTimezone ?? "Timezone unconfirmed"}</p></div>
                  <span className={statusTone(data.brain?.status)}>{data.brain?.status ?? "Brain not assessed"}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="panel-soft p-3"><p className="eyebrow">Retrieved at</p><p className="text-xs text-slate-200">{formatDate(data.retrievedAt)}</p></div>
                  <div className="panel-soft p-3"><p className="eyebrow">Latest candle</p><p className="text-xs text-slate-200">{formatDate(data.latestObservationAt)}</p></div>
                  <div className="panel-soft p-3"><p className="eyebrow">Provider entitlement</p><span className={statusTone(data.source?.entitlementStatus)}>{data.source?.entitlementStatus ?? "Unknown"}</span></div>
                  <div className="panel-soft p-3"><p className="eyebrow">Provider licence</p><span className={statusTone(data.source?.licenceStatus)}>{data.source?.licenceStatus ?? "Unknown"}</span></div>
                </div>
                {data.pricesAvailable && data.candles && data.candles.length > 0 && (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-xs">
                      <thead className="text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="py-2">Timestamp</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>State</th></tr></thead>
                      <tbody className="divide-y divide-white/[0.06]">{data.candles.slice(-12).reverse().map(candle => <tr key={candle.timestamp} className="text-slate-300"><td className="py-3 pr-3">{formatDate(candle.timestamp)}</td><td>{candle.open}</td><td>{candle.high}</td><td>{candle.low}</td><td>{candle.close}</td><td>{candle.provisional ? "Provisional" : "Closed"}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
                {!data.pricesAvailable && <p className="mt-5 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-100/80">The provider can be reachable while price release remains blocked. This is intentional: unverified entitlement, licensing or freshness evidence must not be bypassed.</p>}
              </section>

              <section className="panel mb-5 p-5 sm:p-6">
                <h2 className="section-title">Trading Brain handoff</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">The provider snapshot now passes through the Brain adapter and assessment boundary. This stage reports evidence readiness only; directional output remains locked.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="panel-soft p-3"><p className="eyebrow">Assessment decision</p><p className="text-sm font-semibold text-white">{data.brain?.decision ?? "Not assessed"}</p></div>
                  <div className="panel-soft p-3"><p className="eyebrow">Source references</p><p className="break-all text-xs text-slate-300">{data.brain?.sourceReferences?.join(", ") || "None"}</p></div>
                </div>
                {(data.brain?.uncertainties?.length ?? 0) > 0 && <ul className="mt-4 list-disc space-y-2 pl-5 text-xs leading-5 text-slate-400">{data.brain?.uncertainties?.map(item => <li key={item}>{item}</li>)}</ul>}
              </section>

              <section className="panel p-5 sm:p-6">
                <h2 className="section-title">Diagnostics and limitations</h2>
                {diagnostics.length > 0
                  ? <ul className="mt-4 list-disc space-y-2 pl-5 text-xs leading-5 text-slate-400">{diagnostics.map((item, index) => <li key={index}>{item}</li>)}</ul>
                  : <p className="mt-3 text-xs text-slate-500">No validation warnings or limitations were returned.</p>}
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="panel-soft p-3"><p className="eyebrow">Invalid candles</p><p className="text-lg font-semibold text-white">{validation?.invalidCandles ?? "—"}</p></div>
                  <div className="panel-soft p-3"><p className="eyebrow">Duplicate timestamps</p><p className="text-lg font-semibold text-white">{validation?.duplicateTimestamps?.length ?? "—"}</p></div>
                  <div className="panel-soft p-3"><p className="eyebrow">Missing intervals</p><p className="text-lg font-semibold text-white">{validation?.missingIntervals?.length ?? "—"}</p></div>
                </div>
              </section>
            </>
          )}
          <footer className="mt-7 border-t border-white/[0.07] pt-4 text-[10px] leading-5 text-slate-600">OEM+ Trading Vault · On-demand diagnostics · No automated execution · Not a live trading signal</footer>
        </div>
      </main>
    </div>
  );
}
