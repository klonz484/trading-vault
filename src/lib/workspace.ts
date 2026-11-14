export type JournalTrade = {
  id: string;
  date: string;
  symbol: string;
  side: "BUY" | "SELL";
  entry: number;
  stop: number;
  target: number;
  outcome: "OPEN" | "WIN" | "LOSS" | "BREAKEVEN";
  rMultiple: number;
  notes: string;
  timeframe?: string;
  session?: "ASIA" | "LONDON" | "NEW_YORK" | "LONDON_NEW_YORK_OVERLAP" | "UNKNOWN";
  setupType?: string;
  strategy?: string;
  chartPath?: string;
  realizedR?: number;
  originalPlan?: { date: string; symbol: string; side: "BUY" | "SELL"; entry: number; stop: number; target: number };
  feedbackEvents?: Array<{ eventId: string; kind: "take_profit_hit" | "stop_loss_hit" | "partial_take_profit" | "manual_close"; recordedAt: string; realizedR?: number; actualExitPrice?: number; note?: string }>;
};

export type ScanSectionKey = "visible" | "structure" | "levels" | "momentum" | "scenarios" | "plan" | "uncertainty";

export type SavedScan = {
  id: string;
  createdAt: string;
  symbol: string;
  timeframe: string;
  model: string;
  analysis: string;
  schemaVersion?: 2;
  revision?: number;
  summary?: string;
  sections?: Partial<Record<ScanSectionKey, string>>;
};

const SCAN_HEADINGS: Array<{ key: ScanSectionKey; pattern: RegExp }> = [
  { key: "visible", pattern: /what is visibly on the chart/i },
  { key: "structure", pattern: /market structure and directional bias/i },
  { key: "levels", pattern: /key support and resistance/i },
  { key: "momentum", pattern: /momentum\s*\/\s*visible indicators and patterns/i },
  { key: "scenarios", pattern: /possible scenarios/i },
  { key: "plan", pattern: /trade plan framework/i },
  { key: "uncertainty", pattern: /what is uncertain or cannot be read/i },
];

export function structureScanAnalysis(analysis: string): {
  summary: string;
  sections: Partial<Record<ScanSectionKey, string>>;
} {
  const sections: Partial<Record<ScanSectionKey, string>> = {};
  let active: ScanSectionKey | null = null;
  const unmatched: string[] = [];

  for (const rawLine of analysis.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const normalizedHeading = line.replace(/^#+\s*/, "").replace(/^\*\*/, "").replace(/\*\*$/, "").replace(/^\d+\.\s*/, "").trim();
    const heading = SCAN_HEADINGS.find((item) => item.pattern.test(normalizedHeading));
    if (heading) {
      active = heading.key;
      continue;
    }
    if (/^\d+\.\s+/.test(line) && !active) {
      unmatched.push(line.replace(/^\d+\.\s*/, ""));
      continue;
    }
    if (active) sections[active] = [sections[active], line].filter(Boolean).join("\n");
    else unmatched.push(line);
  }

  const summarySource = [sections.visible, sections.structure, unmatched.join(" ")].filter(Boolean).join(" ");
  const summary = summarySource
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(" ")
    .slice(0, 420)
    || "Analysis saved. Open the full report to review its evidence and conditions.";

  return { summary, sections };
}

export const JOURNAL_STORAGE_KEY = "oemplus.trading-vault.journal.v1";
export const SCAN_STORAGE_KEY = "oemplus.trading-vault.scans.v1";
export const SETTINGS_STORAGE_KEY = "oemplus.trading-vault.settings.v1";

export function readLocalList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(key);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalList<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}
