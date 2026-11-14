"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { JOURNAL_STORAGE_KEY, JournalTrade, readLocalList, writeLocalList } from "@/lib/workspace";

type JournalRow = {
  id: string;
  instrument: string;
  occurred_at: string;
  payload: unknown;
};

type StorageMode = "loading" | "cloud" | "local";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTrade(value: unknown): JournalTrade | null {
  if (!isRecord(value)) return null;
  const trade = isRecord(value.trade) ? value.trade : value;
  if (
    typeof trade.id !== "string" ||
    typeof trade.date !== "string" ||
    typeof trade.symbol !== "string" ||
    (trade.side !== "BUY" && trade.side !== "SELL") ||
    !["OPEN", "WIN", "LOSS", "BREAKEVEN"].includes(String(trade.outcome)) ||
    ![trade.entry, trade.stop, trade.target, trade.rMultiple].every(
      (number) => typeof number === "number" && Number.isFinite(number),
    ) ||
    typeof trade.notes !== "string"
  ) return null;

  return {
    id: trade.id,
    date: trade.date,
    symbol: trade.symbol,
    side: trade.side,
    entry: trade.entry as number,
    stop: trade.stop as number,
    target: trade.target as number,
    outcome: trade.outcome as JournalTrade["outcome"],
    rMultiple: trade.rMultiple as number,
    notes: trade.notes,
  };
}

function mapCloudRows(rows: unknown): JournalTrade[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(isRecord)
    .map((row) => parseTrade(row.payload))
    .filter((trade): trade is JournalTrade => trade !== null);
}

export default function JournalPage() {
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [ready, setReady] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>("loading");
  const [storageMessage, setStorageMessage] = useState("Checking your private journal...");
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("");
  const [symbol, setSymbol] = useState("EURUSD");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [outcome, setOutcome] = useState<JournalTrade["outcome"]>("OPEN");
  const [rMultiple, setRMultiple] = useState("2");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const now = new Date();
    setDate([now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-"));

    async function loadJournal() {
      try {
        const response = await fetch("/api/trader/journal?limit=100", { cache: "no-store" });
        const body: unknown = await response.json();
        if (!active) return;

        if (response.ok && isRecord(body)) {
          setTrades(mapCloudRows(body.entries));
          setStorageMode("cloud");
          setStorageMessage("Private cloud journal · synced to your account");
        } else {
          setTrades(readLocalList<JournalTrade>(JOURNAL_STORAGE_KEY));
          setStorageMode("local");
          setStorageMessage(
            response.status === 401
              ? "Local journal · sign in to use private cloud sync. Existing browser records are kept separate."
              : "Local journal · cloud service is currently unavailable. Your browser records remain safe.",
          );
        }
      } catch {
        if (!active) return;
        setTrades(readLocalList<JournalTrade>(JOURNAL_STORAGE_KEY));
        setStorageMode("local");
        setStorageMessage("Local journal · cloud connection unavailable. Your browser records remain safe.");
      } finally {
        if (active) setReady(true);
      }
    }

    void loadJournal();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (ready && storageMode === "local") {
      writeLocalList(JOURNAL_STORAGE_KEY, trades);
    }
  }, [trades, ready, storageMode]);

  const stats = useMemo(() => {
    const closed = trades.filter((trade) => trade.outcome !== "OPEN");
    const wins = closed.filter((trade) => trade.outcome === "WIN").length;
    const losses = closed.filter((trade) => trade.outcome === "LOSS").length;
    const sum = closed.reduce((total, trade) => total + (
      trade.outcome === "WIN" ? Math.abs(trade.rMultiple)
        : trade.outcome === "LOSS" ? -Math.abs(trade.rMultiple) : 0
    ), 0);
    return {
      total: trades.length,
      closed: closed.length,
      wins,
      losses,
      winRate: closed.length ? Math.round(wins / closed.length * 100) : 0,
      netR: sum.toFixed(2),
    };
  }, [trades]);

  async function addTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const values = [Number(entry), Number(stop), Number(target), Number(rMultiple)];
    if (!date || !symbol.trim() || values.some((value) => !Number.isFinite(value)) ||
      values[0] <= 0 || values[1] <= 0 || values[2] <= 0 || values[3] < 0) {
      setError("Enter a valid date, instrument, positive price levels and a non-negative R multiple.");
      return;
    }

    const item: JournalTrade = {
      id: crypto.randomUUID(),
      date,
      symbol: symbol.toUpperCase().trim(),
      side,
      entry: values[0],
      stop: values[1],
      target: values[2],
      outcome,
      rMultiple: values[3],
      notes: notes.trim(),
    };

    if (storageMode === "cloud") {
      setBusy(true);
      try {
        const response = await fetch("/api/trader/journal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instrument: item.symbol,
            occurredAt: new Date(date + "T12:00:00").toISOString(),
            entryType: "trade",
            payload: { schemaVersion: 1, trade: item },
          }),
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          setError(isRecord(body) && typeof body.error === "string" ? body.error : "Could not save this private journal entry.");
          return;
        }
        setTrades((current) => [item, ...current]);
      } catch {
        setError("The cloud save failed. Your entry was not added; please try again.");
        return;
      } finally {
        setBusy(false);
      }
    } else {
      setTrades((current) => [item, ...current]);
    }

    setEntry("");
    setStop("");
    setTarget("");
    setNotes("");
    setOutcome("OPEN");
  }

  async function removeTrade(id: string) {
    setError("");
    if (storageMode === "cloud") {
      setBusy(true);
      try {
        const response = await fetch("/api/trader/journal", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          setError(isRecord(body) && typeof body.error === "string" ? body.error : "Could not delete this journal entry.");
          return;
        }
      } catch {
        setError("The cloud delete failed. The journal entry was kept.");
        return;
      } finally {
        setBusy(false);
      }
    }
    setTrades((current) => current.filter((trade) => trade.id !== id));
  }

  return <div className="min-h-screen md:flex">
    <Sidebar />
    <main className="min-w-0 flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8">
      <div className="mx-auto max-w-[1450px]">
        <div className="mb-7">
          <p className="eyebrow">Personal performance</p>
          <h1 className="page-title">Trading Journal</h1>
          <p className="page-subtitle">Record decisions, outcomes and lessons. Your private journal helps you review performance and improve your process.</p>
          <p className="mt-2 text-xs text-slate-400" role="status">{storageMessage}</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: "Total trades", value: stats.total },
            { label: "Closed trades", value: stats.closed },
            { label: "Win rate", value: stats.closed ? stats.winRate + "%" : "—" },
            { label: "Net result", value: stats.closed ? (Number(stats.netR) > 0 ? "+" : "") + stats.netR + "R" : "—" },
          ].map((item) => <div className="panel p-4 sm:p-5" key={item.label}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
          </div>)}
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[.85fr_1.5fr]">
          <form onSubmit={addTrade} className="panel space-y-4 p-5">
            <div>
              <h2 className="section-title">Log a trade</h2>
              <p className="mt-1 text-xs text-slate-500">Capture the plan and the outcome.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">Date<input className="field-control" type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
              <label className="field-label">Instrument<input className="field-control uppercase" value={symbol} onChange={(event) => setSymbol(event.target.value)} maxLength={20} required /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">Direction<select className="field-control" value={side} onChange={(event) => setSide(event.target.value as "BUY" | "SELL")}><option value="BUY">BUY</option><option value="SELL">SELL</option></select></label>
              <label className="field-label">Outcome<select className="field-control" value={outcome} onChange={(event) => setOutcome(event.target.value as JournalTrade["outcome"])}><option value="OPEN">Open</option><option value="WIN">Win</option><option value="LOSS">Loss</option><option value="BREAKEVEN">Breakeven</option></select></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">Entry price<input className="field-control" type="number" step="any" value={entry} onChange={(event) => setEntry(event.target.value)} required /></label>
              <label className="field-label">Stop loss<input className="field-control" type="number" step="any" value={stop} onChange={(event) => setStop(event.target.value)} required /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">Target price<input className="field-control" type="number" step="any" value={target} onChange={(event) => setTarget(event.target.value)} required /></label>
              <label className="field-label">Result (R)<input className="field-control" type="number" min="0" step="0.1" value={rMultiple} onChange={(event) => setRMultiple(event.target.value)} required /></label>
            </div>
            <label className="field-label">Trade reasoning and lessons<textarea className="field-control min-h-24 resize-y" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1200} placeholder="Why did you take this trade? Which confirmations were present? What did you learn?" /></label>
            {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
            <button className="btn-primary w-full" type="submit" disabled={!ready || busy || storageMode === "loading"}>{busy ? "Saving..." : "Save journal entry"}</button>
            <p className="text-[10px] leading-4 text-slate-500">
              {storageMode === "cloud"
                ? "Entries are saved to your authenticated private account."
                : "Local-only mode. Browser records are kept separate from cloud records; nothing is automatically imported or deleted."}
            </p>
          </form>

          <section className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] p-5">
              <div><h2 className="section-title">Trade history</h2><p className="mt-1 text-xs text-slate-500">Your saved journal entries</p></div>
              <span className="status-neutral">{trades.length} records</span>
            </div>
            {!ready ? <div className="px-5 py-14 text-center text-xs text-slate-500">Loading your journal...</div>
              : !trades.length ? <div className="px-5 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-xl text-slate-300">▤</div>
                <h3 className="mt-4 text-sm font-semibold text-white">Your journal starts here</h3>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">Add your first trade to build a private record of setups, outcomes and lessons.</p>
              </div> : <div className="divide-y divide-white/[0.06]">
                {trades.map((trade) => <article key={trade.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{trade.symbol}</span>
                        <span className={trade.side === "BUY" ? "status-success" : "status-danger"}>{trade.side}</span>
                        <span className={trade.outcome === "WIN" ? "status-success" : trade.outcome === "LOSS" ? "status-danger" : "status-neutral"}>{trade.outcome}</span>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-500">{trade.date} · Entry {trade.entry} · SL {trade.stop} · TP {trade.target}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-white">{trade.outcome === "LOSS" ? "−" : trade.outcome === "WIN" ? "+" : ""}{trade.outcome === "OPEN" ? "Open" : trade.outcome === "BREAKEVEN" ? "0R" : trade.rMultiple + "R"}</span>
                      <button type="button" disabled={busy} onClick={() => void removeTrade(trade.id)} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-white/5 hover:text-rose-300 disabled:opacity-50" aria-label={"Delete " + trade.symbol + " journal entry"}>Delete</button>
                    </div>
                  </div>
                  {trade.notes && <p className="mt-3 text-xs leading-5 text-slate-400">{trade.notes}</p>}
                </article>)}
              </div>}
          </section>
        </div>
      </div>
    </main>
  </div>;
}
