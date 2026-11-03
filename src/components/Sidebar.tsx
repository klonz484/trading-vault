"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "◆" },
  { href: "/scanner", label: "Chart Scanner", icon: "▣" },
  { href: "/setups", label: "AI Setups", icon: "▲" },
  { href: "/risk", label: "Risk Calculator", icon: "◎" },
  { href: "/journal", label: "Journal", icon: "▤" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 min-h-screen border-r border-[var(--border)] bg-[var(--card)] flex flex-col">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center text-black font-bold text-sm">
            TV
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-wide text-white">
              Trading Vault
            </h1>
            <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
              Personal Terminal
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                  : "text-[var(--muted)] hover:text-white hover:bg-[var(--card-hover)]"
              }`}
            >
              <span className="text-base opacity-80">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Status */}
      <div className="px-4 py-4 border-t border-[var(--border)]">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Offline Mode</span>
        </div>
        <p className="text-[10px] text-[var(--muted)] mt-1">
          Free models • Local first
        </p>
      </div>
    </aside>
  );
}
