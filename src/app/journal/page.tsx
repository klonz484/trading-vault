"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { analyzePrivateLearningPatterns, plannedRewardR, recordJournalFeedback, summarizeJournalFeedback, type JournalFeedbackKind } from "@/lib/trading-brain/feedback-learning";
import { JOURNAL_STORAGE_KEY, JournalTrade, readLocalList, writeLocalList } from "@/lib/workspace";

type StorageMode = "loading" | "cloud" | "local";

function formatToday() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

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
    ...(typeof trade.realizedR === "number" && Number.isFinite(trade.realizedR) ? { realizedR: trade.realizedR } : {}),
    ...(isRecord(trade.originalPlan) ? { originalPlan: trade.originalPlan as JournalTrade["originalPlan"] } : {}),
    ...(Array.isArray(trade.feedbackEvents) ? { feedbackEvents: trade.feedbackEvents as JournalTrade["feedbackEvents"] } : {}),
  };
}

function mapCloudRows(rows: unknown): JournalTrade[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(isRecord)
    .map((row) => {
      const trade = parseTrade(row.payload);
      return trade && typeof row.id === "string" ? { ...trade, id: row.id } : null;
    })
    .filter((trade): trade is JournalTrade => trade !== null);
}

export default function JournalPage() {
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [localArchive, setLocalArchive] = useState<JournalTrade[]>([]);
  const [showLocalArchive, setShowLocalArchive] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>("loading");
  const [storageMessage, setStorageMessage] = useState("Checking your private journal...");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
    async function loadJournal() {
      try {
        const response = await fetch("/api/trader/journal?limit=100", { cache: "no-store" });
        setDate((current) => current || formatToday());
        const body: unknown = await response.json();
        if (!active) return;

        if (response.ok && isRecord(body)) {
          setLocalArchive(readLocalList<JournalTrade>(JOURNAL_STORAGE_KEY));
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
        setDate((current) => current || formatToday());
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
      typeof trade.realizedR === "number" ? trade.realizedR
        : trade.outcome === "WIN" ? Math.abs(trade.rMultiple)
          : trade.outcome === "LOSS" ? -Math.abs(trade.rMultiple) : 0
    ), 0);
    return {
      total: trades.length,
      closed: closed.length,
      wins,
      losses,
      winRate: wins + losses ? Math.round(wins / (wins + losses) * 100) : 0,
      netR: sum.toFixed(2),
    };
  }, [trades]);
  const feedbackStats = useMemo(() => summarizeJournalFeedback(trades), [trades]);
  const learningPatterns = useMemo(() => analyzePrivateLearningPatterns(trades), [trades]);

  function exportLocalArchive() {
    if (!localArchive.length) return;
    const blob = new Blob([JSON.stringify(localArchive, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trading-vault-local-journal-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function addTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const values = [Number(entry), Number(stop), Number(target), Number(rMultiple)];
    if (!date || !symbol.trim() || values.some((value) => !Number.isFinite(value)) ||
      values[0] <= 0 || values[1] <= 0 || values[2] <= 0 || values[3] < 0) {
      setError("Enter a valid date, instrument, positive price levels and a non-negative R multiple.");
      return;
    }

    const existingTrade = editingId ? trades.find((trade) => trade.id === editingId) : undefined;
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
      originalPlan: existingTrade?.originalPlan ?? {
        date, symbol: symbol.toUpperCase().trim(), side, entry: values[0], stop: values[1], target: values[2],
      },
      ...(existingTrade?.realizedR !== undefined ? { realizedR: existingTrade.realizedR } : {}),
      ...(existingTrade?.feedbackEvents ? { feedbackEvents: existingTrade.feedbackEvents } : {}),
    };

    if (storageMode === "cloud") {
      setBusy(true);
      try {
        const response = await fetch("/api/trader/journal", {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(editingId ? { id: editingId } : {}),
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
        const savedRow = isRecord(body) && isRecord(body.entry) ? body.entry : null;
        if (!savedRow || typeof savedRow.id !== "string") {
          setError("The server saved the entry but did not return its record ID. Refresh the journal before deleting it.");
          return;
        }
        setTrades((current) => editingId
          ? current.map((trade) => trade.id === editingId ? { ...item, id: editingId } : trade)
          : [{ ...item, id: savedRow.id as string }, ...current]);
      } catch {
        setError("The cloud save failed. Your entry was not added; please try again.");
        return;
      } finally {
        setBusy(false);
      }
    } else {
      setTrades((current) => editingId
        ? current.map((trade) => trade.id === editingId ? { ...item, id: editingId } : trade)
        : [item, ...current]);
    }

    setEditingId(null);
    setEntry("");
    setStop("");
    setTarget("");
    setNotes("");
    setOutcome("OPEN");
  }

  async function recordOutcomeFeedback(trade: JournalTrade, kind: JournalFeedbackKind) {
    if (busy || trade.outcome !== "OPEN") return;
    let realizedR: number;
    const hasPartialExit = (trade.feedbackEvents ?? []).some((event) => event.kind === "partial_take_profit");
    if (kind === "take_profit_hit" && !hasPartialExit) {
      try { realizedR = plannedRewardR(trade); } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Check the trade levels before recording profit."); return;
      }
    } else if (kind === "stop_loss_hit" && !hasPartialExit) {
      realizedR = -1;
    } else {
      const prompt = kind === "partial_take_profit"
        ? "Enter the realized R from the partial position you closed (positive number):"
        : hasPartialExit
          ? "Enter the realized R for the remaining position only (use a minus sign for a loss):"
          : "Enter realized R (e.g. 1.2 for +1.2R or -0.5 for -0.5R):";
      const answer = window.prompt(prompt);
      if (answer === null) return;
      realizedR = Number(answer);
      if (!Number.isFinite(realizedR)) { setError("Enter a valid realized R value. Use a minus sign for a loss."); return; }
    }
    const actualExitPrice = kind === "take_profit_hit" ? trade.target : kind === "stop_loss_hit" ? trade.stop : undefined;
    let updated: JournalTrade;
    try {
      updated = recordJournalFeedback(trade, {
        eventId: crypto.randomUUID(), kind, recordedAt: new Date().toISOString(), realizedR,
        ...(actualExitPrice === undefined ? {} : { actualExitPrice }),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Feedback could not be recorded."); return;
    }
    setError("");
    if (storageMode === "cloud") {
      setBusy(true);
      try {
        const response = await fetch("/api/trader/journal", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: trade.id, instrument: updated.symbol, occurredAt: new Date(updated.date + "T12:00:00").toISOString(), entryType: "trade", payload: { schemaVersion: 2, trade: updated } }),
        });
        const body: unknown = await response.json();
        if (!response.ok) { setError(isRecord(body) && typeof body.error === "string" ? body.error : "Feedback could not be saved."); return; }
      } catch {
        setError("Feedback could not be saved. The trade remains unchanged."); return;
      } finally { setBusy(false); }
    }
    setTrades((current) => current.map((item) => item.id === trade.id ? updated : item));
  }

  function startEditing(trade: JournalTrade) {
    setEditingId(trade.id);
    setDate(trade.date);
    setSymbol(trade.symbol);
    setSide(trade.side);
    setEntry(String(trade.entry));
    setStop(String(trade.stop));
    setTarget(String(trade.target));
    setOutcome(trade.outcome);
    setRMultiple(String(trade.rMultiple));
    setNotes(trade.notes);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeTrade(id: string) {
    const confirmed = window.confirm("Delete this journal entry? This cannot be undone.");
    if (!confirmed) return;
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
            { label: "Brain feedback events", value: feedbackStats.eventCount },
          ].map((item) => <div className="panel p-4 sm:p-5" key={item.label}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
          </div>)}
        </div>

        {learningPatterns.length > 0 && <section className="panel mb-6 p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="section-title">Private Brain learning review</h2>
            <p className="mt-1 text-xs text-slate-500">
              Descriptive patterns from closed trades with recorded feedback. {storageMode === "cloud" ? "Based on your private cloud journal." : "Device-only analysis; sign in to make feedback available to your private cloud Brain."}
              {" "}These observations do not automatically change a strategy.
            </p>
          </div>
          <div className="space-y-3">
            {learningPatterns.map((pattern) => <div key={pattern.symbol + pattern.side} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <div>
                <p className="text-sm font-semibold text-white">{pattern.symbol} · {pattern.side}</p>
                <p className="mt-1 text-[10px] text-slate-500">{pattern.sampleCount} feedback-linked closed trades · {pattern.wins} wins · {pattern.losses} losses · {pattern.breakeven} breakeven</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{pattern.averageRealizedR > 0 ? "+" : ""}{pattern.averageRealizedR}R average</p>
                <p className="text-[10px] text-slate-400">{pattern.winRate === null ? "No decisive outcomes" : pattern.winRate + "% win rate"}</p>
                <p className="mt-1 text-[10px] text-slate-500">{pattern.reviewState === "review_candidate" ? "Sample ready for controlled review" : pattern.reviewState === "early_pattern" ? "Early pattern · gather more data" : "Insufficient sample · keep collecting"}</p>
              </div>
            </div>)}
          </div>
        </section>}

        {storageMode === "cloud" && localArchive.length > 0 && <section className="panel mb-6 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">Local archive on this device</h2>
              <p className="mt-1 text-xs text-slate-500">{localArchive.length} older browser record{localArchive.length === 1 ? "" : "s"} · not uploaded to your cloud journal</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowLocalArchive((visible) => !visible)}>{showLocalArchive ? "Hide archive" : "View archive"}</button>
              <button type="button" className="btn-secondary" onClick={exportLocalArchive}>Export JSON</button>
            </div>
          </div>
          {showLocalArchive && <div className="mt-4 max-h-80 space-y-2 overflow-y-auto border-t border-white/[0.07] pt-4">
            {localArchive.map((trade) => <div key={trade.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.025] px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-white">{trade.symbol} · {trade.side}</span>
                <span className="ml-2 text-[10px] text-slate-500">{trade.date} · {trade.outcome}</span>
                {trade.notes && <p className="mt-1 text-[10px] text-slate-500">{trade.notes}</p>}
              </div>
              <span className="text-[10px] text-slate-400">Local only</span>
            </div>)}
          </div>}
        </section>}

        <div className="grid items-start gap-5 xl:grid-cols-[.85fr_1.5fr]">
          <form onSubmit={addTrade} className="panel space-y-4 p-5">
            <div>
              <h2 className="section-title">{editingId ? "Edit trade" : "Log a trade"}</h2>
              <p className="mt-1 text-xs text-slate-500">{editingId ? "Update the plan or record the final outcome." : "Capture the plan and the outcome."}</p>
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
            <button className="btn-primary w-full" type="submit" disabled={!ready || busy || storageMode === "loading"}>{busy ? "Saving..." : editingId ? "Update journal entry" : "Save journal entry"}</button>
            {editingId && <button className="btn-secondary w-full" type="button" disabled={busy} onClick={() => { setEditingId(null); setError(""); setEntry(""); setStop(""); setTarget(""); setNotes(""); setOutcome("OPEN"); setDate(new Date().toISOString().slice(0, 10)); setSymbol("EURUSD"); setSide("BUY"); setRMultiple("2"); }}>Cancel editing</button>}
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
                      <button type="button" disabled={busy} onClick={() => startEditing(trade)} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50">Edit</button>
                      <button type="button" disabled={busy} onClick={() => void removeTrade(trade.id)} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-white/5 hover:text-rose-300 disabled:opacity-50" aria-label={"Delete " + trade.symbol + " journal entry"}>Delete</button>
                    </div>
                  </div>
                  {trade.notes && <p className="mt-3 text-xs leading-5 text-slate-400">{trade.notes}</p>}
                  {trade.feedbackEvents && trade.feedbackEvents.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
                    {trade.feedbackEvents.map((event) => <span key={event.eventId} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-slate-400">
                      {event.kind.replaceAll("_", " ")}{typeof event.realizedR === "number" ? ` · ${event.realizedR > 0 ? "+" : ""}${event.realizedR.toFixed(2)}R` : ""}
                    </span>)}
                    <span className="text-[10px] text-slate-500">{storageMode === "cloud" ? "Saved to your private journal for Brain review · no automatic strategy change" : "Saved on this device only · sign in required for private Brain review"}</span>
                  </div>}
                  {trade.outcome === "OPEN" && <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => void recordOutcomeFeedback(trade, "take_profit_hit")} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 disabled:opacity-50">Take-profit hit</button>
                    <button type="button" disabled={busy} onClick={() => void recordOutcomeFeedback(trade, "stop_loss_hit")} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 disabled:opacity-50">Stop-loss hit</button>
                    <button type="button" disabled={busy} onClick={() => void recordOutcomeFeedback(trade, "partial_take_profit")} className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 disabled:opacity-50">Partial take-profit</button>
                    <button type="button" disabled={busy} onClick={() => void recordOutcomeFeedback(trade, "manual_close")} className="btn-secondary disabled:opacity-50">Closed manually</button>
                  </div>}
                </article>)}
              </div>}
          </section>
        </div>
      </div>
    </main>
  </div>;
}
