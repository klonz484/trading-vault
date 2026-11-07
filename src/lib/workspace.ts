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
};

export type SavedScan = {
  id: string;
  createdAt: string;
  symbol: string;
  timeframe: string;
  model: string;
  analysis: string;
};

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
