import type { InstrumentDefinition, InstrumentId, MarketDataTimeframe } from "./types";

export const INSTRUMENTS: Record<InstrumentId, InstrumentDefinition> = {
  EURUSD: {
    id: "EURUSD", baseCurrency: "EUR", quoteCurrency: "USD", assetClass: "forex",
    twelveDataSymbol: "EUR/USD", alphaVantagePair: ["EUR", "USD"],
    initialPriority: true, providerEntitlementsRequireVerification: true,
  },
  XAUUSD: {
    id: "XAUUSD", baseCurrency: "XAU", quoteCurrency: "USD", assetClass: "metal",
    twelveDataSymbol: "XAU/USD",
    initialPriority: true, providerEntitlementsRequireVerification: true,
  },
  GBPUSD: {
    id: "GBPUSD", baseCurrency: "GBP", quoteCurrency: "USD", assetClass: "forex",
    twelveDataSymbol: "GBP/USD", alphaVantagePair: ["GBP", "USD"],
    initialPriority: false, providerEntitlementsRequireVerification: true,
  },
  USDJPY: {
    id: "USDJPY", baseCurrency: "USD", quoteCurrency: "JPY", assetClass: "forex",
    twelveDataSymbol: "USD/JPY", alphaVantagePair: ["USD", "JPY"],
    initialPriority: false, providerEntitlementsRequireVerification: true,
  },
  USDCHF: {
    id: "USDCHF", baseCurrency: "USD", quoteCurrency: "CHF", assetClass: "forex",
    twelveDataSymbol: "USD/CHF", alphaVantagePair: ["USD", "CHF"],
    initialPriority: false, providerEntitlementsRequireVerification: true,
  },
  USDCAD: {
    id: "USDCAD", baseCurrency: "USD", quoteCurrency: "CAD", assetClass: "forex",
    twelveDataSymbol: "USD/CAD", alphaVantagePair: ["USD", "CAD"],
    initialPriority: false, providerEntitlementsRequireVerification: true,
  },
  AUDUSD: {
    id: "AUDUSD", baseCurrency: "AUD", quoteCurrency: "USD", assetClass: "forex",
    twelveDataSymbol: "AUD/USD", alphaVantagePair: ["AUD", "USD"],
    initialPriority: false, providerEntitlementsRequireVerification: true,
  },
  NZDUSD: {
    id: "NZDUSD", baseCurrency: "NZD", quoteCurrency: "USD", assetClass: "forex",
    twelveDataSymbol: "NZD/USD", alphaVantagePair: ["NZD", "USD"],
    initialPriority: false, providerEntitlementsRequireVerification: true,
  },
};

export const TWELVE_DATA_INTERVALS: Record<MarketDataTimeframe, string> = {
  M1: "1min",
  M5: "5min",
  M15: "15min",
  M30: "30min",
  H1: "1h",
  H4: "4h",
  D1: "1day",
  W1: "1week",
};

export function getInstrument(value: string): InstrumentDefinition | null {
  return INSTRUMENTS[value.toUpperCase() as InstrumentId] ?? null;
}

export function isMarketDataTimeframe(value: string): value is MarketDataTimeframe {
  return Object.prototype.hasOwnProperty.call(TWELVE_DATA_INTERVALS, value);
}
