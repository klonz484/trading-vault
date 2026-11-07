export type ScannerDecision = "BUY" | "SELL" | "NO TRADE";
export type ScannerOrderType = "MARKET" | "PENDING" | "NONE";
export type ScannerEntryType = "exact" | "range" | "conditional_close" | "none";

export type ScannerSummary = {
  decision: ScannerDecision;
  orderType: ScannerOrderType;
  entryType: ScannerEntryType;
  entry: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  takeProfit3: number | null;
  invalidation: number | null;
  reason: string;
  confidenceLabel: "Not calibrated";
};

const NO_TRADE_REASON =
  "No complete, directionally valid setup was returned. Review the detailed analysis; do not enter a trade.";

function numberField(block: string, label: string): number | null {
  const match = block.match(new RegExp("^\\s*" + label + "\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)\\s*$", "im"));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function textField(block: string, label: string): string {
  return block.match(new RegExp("^\\s*" + label + "\\s*:\\s*(.*?)\\s*$", "im"))?.[1]?.trim() || "";
}

export function parseScannerSummary(analysis: string): ScannerSummary {
  const match = analysis.match(/TV_SETUP_SUMMARY_START\s*\n([\s\S]*?)\nTV_SETUP_SUMMARY_END/i);
  if (!match) {
    return {
      decision: "NO TRADE", orderType: "NONE", entryType: "none",
      entry: null, entryLow: null, entryHigh: null, stopLoss: null,
      takeProfit1: null, takeProfit2: null, takeProfit3: null, invalidation: null,
      reason: NO_TRADE_REASON, confidenceLabel: "Not calibrated",
    };
  }

  const block = match[1];
  const requestedDecision = textField(block, "Decision").toUpperCase();
  const requestedOrder = textField(block, "OrderType").toUpperCase();
  const rawEntryType = textField(block, "EntryType").toLowerCase();
  const entryType: ScannerEntryType =
    rawEntryType === "exact" || rawEntryType === "range" || rawEntryType === "conditional_close"
      ? rawEntryType : "none";
  const entry = numberField(block, "Entry");
  const entryLow = numberField(block, "EntryLow");
  const entryHigh = numberField(block, "EntryHigh");
  const stopLoss = numberField(block, "StopLoss");
  const takeProfit1 = numberField(block, "TakeProfit1");
  const takeProfit2 = numberField(block, "TakeProfit2");
  const takeProfit3 = numberField(block, "TakeProfit3");
  const invalidation = numberField(block, "Invalidation");
  const reason = textField(block, "Reason");

  if (requestedDecision === "NO TRADE") {
    return {
      decision: "NO TRADE", orderType: "NONE", entryType: "none",
      entry: null, entryLow: null, entryHigh: null, stopLoss: null,
      takeProfit1: null, takeProfit2: null, takeProfit3: null, invalidation: null,
      reason: reason || "The chart does not currently support an actionable setup.",
      confidenceLabel: "Not calibrated",
    };
  }

  const isBuy = requestedDecision === "BUY";
  const validOrder = requestedOrder === "MARKET" || requestedOrder === "PENDING";
  const validEntry =
    entryType === "range"
      ? entryLow !== null && entryHigh !== null && entryLow <= entryHigh
      : (entryType === "exact" || entryType === "conditional_close") && entry !== null;
  const low = entryType === "range" ? entryLow : entry;
  const high = entryType === "range" ? entryHigh : entry;
  const validDirection =
    low !== null && high !== null && stopLoss !== null && takeProfit1 !== null &&
    (isBuy ? stopLoss < low && takeProfit1 > high : stopLoss > high && takeProfit1 < low);
  const validOrderForTrigger = entryType !== "conditional_close" || requestedOrder === "PENDING";
  const validTargetSequence =
    (takeProfit2 === null || (isBuy ? takeProfit2 > takeProfit1! : takeProfit2 < takeProfit1!)) &&
    (takeProfit3 === null || (isBuy ? takeProfit3 > (takeProfit2 ?? takeProfit1!) : takeProfit3 < (takeProfit2 ?? takeProfit1!)));

  if (
    (requestedDecision !== "BUY" && requestedDecision !== "SELL") ||
    !validOrder || !validEntry || !validDirection || !validOrderForTrigger || !validTargetSequence
  ) {
    return {
      decision: "NO TRADE", orderType: "NONE", entryType: "none",
      entry: null, entryLow: null, entryHigh: null, stopLoss: null,
      takeProfit1: null, takeProfit2: null, takeProfit3: null, invalidation: null,
      reason: "The proposed setup is missing required levels or failed a directional safety check. " + (reason || ""),
      confidenceLabel: "Not calibrated",
    };
  }

  return {
    decision: requestedDecision as "BUY" | "SELL",
    orderType: requestedOrder as "MARKET" | "PENDING",
    entryType, entry, entryLow, entryHigh, stopLoss, takeProfit1, takeProfit2, takeProfit3,
    invalidation, reason: reason || "No concise setup explanation was supplied.",
    confidenceLabel: "Not calibrated",
  };
}
