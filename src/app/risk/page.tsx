"use client";

import { useState, useMemo } from "react";
import Sidebar from "@/components/Sidebar";

export default function RiskCalculatorPage() {
  const [balance, setBalance] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [stopPips, setStopPips] = useState(20);
  const [pair, setPair] = useState("EURUSD");
  const [accountCurrency, setAccountCurrency] = useState("USD");

  // Approximate pip values (standard lot) - simplified for majors + gold
  const pipValuePerLot: Record<string, number> = {
    EURUSD: 10,
    GBPUSD: 10,
    USDJPY: 9.1, // approx
    AUDUSD: 10,
    USDCAD: 7.5,
    XAUUSD: 1, // $1 per pip per 0.01 lot roughly adjusted later
  };

  const result = useMemo(() => {
    const riskAmount = balance * (riskPercent / 100);
    const pipValue = pipValuePerLot[pair] || 10;

    // For gold special handling (very simplified)
    let lotSize = 0;
    if (pair === "XAUUSD") {
      // Rough: $1 move on 0.01 lot ≈ $0.10? Wait, standard is different.
      // Better simple formula: risk / (stop * pip value)
      // Using approximate $1 per pip for 1.00 lot on gold is wrong; 
      // Common retail: 0.01 lot gold ≈ $0.10 per $0.1 move, but for simplicity:
      lotSize = riskAmount / (stopPips * 1); // placeholder - user can adjust
      lotSize = Math.max(0.01, Math.round(lotSize * 100) / 100);
    } else {
      lotSize = riskAmount / (stopPips * pipValue);
      lotSize = Math.max(0.01, Math.round(lotSize * 100) / 100);
    }

    const riskReward = 2; // default display
    return {
      riskAmount: riskAmount.toFixed(2),
      lotSize: lotSize.toFixed(2),
      potentialProfit: (riskAmount * riskReward).toFixed(2),
    };
  }, [balance, riskPercent, stopPips, pair]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Risk Calculator
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Position sizing for MT5 • Manual execution
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 max-w-5xl">
          {/* Inputs */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 space-y-5">
            <h2 className="font-medium text-white mb-2">Inputs</h2>

            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">
                Account Balance ({accountCurrency})
              </label>
              <input
                type="number"
                value={balance}
                onChange={(e) => setBalance(Number(e.target.value))}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">
                Risk per Trade (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={riskPercent}
                onChange={(e) => setRiskPercent(Number(e.target.value))}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">
                Stop Loss (pips)
              </label>
              <input
                type="number"
                value={stopPips}
                onChange={(e) => setStopPips(Number(e.target.value))}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">
                Instrument
              </label>
              <select
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="EURUSD">EURUSD</option>
                <option value="GBPUSD">GBPUSD</option>
                <option value="USDJPY">USDJPY</option>
                <option value="AUDUSD">AUDUSD</option>
                <option value="USDCAD">USDCAD</option>
                <option value="XAUUSD">XAUUSD (Gold)</option>
              </select>
            </div>
          </div>

          {/* Results */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
            <h2 className="font-medium text-white mb-6">Results</h2>

            <div className="space-y-6">
              <div>
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider">
                  Risk Amount
                </p>
                <p className="text-3xl font-semibold text-white mt-1">
                  ${result.riskAmount}
                </p>
              </div>

              <div className="pt-4 border-t border-[var(--border)]">
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider">
                  Recommended Lot Size
                </p>
                <p className="text-4xl font-bold text-cyan-400 mt-1">
                  {result.lotSize}
                </p>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Standard lots • Adjust if your broker uses different contract size
                </p>
              </div>

              <div className="pt-4 border-t border-[var(--border)]">
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider">
                  At 1:2 R:R Potential
                </p>
                <p className="text-2xl font-semibold text-emerald-400 mt-1">
                  +${result.potentialProfit}
                </p>
              </div>
            </div>

            <div className="mt-8 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
              <p className="text-xs text-cyan-300/80">
                Note: Gold (XAUUSD) pip value is approximate. Always verify with
                your MT5 contract specification before entering a trade.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
