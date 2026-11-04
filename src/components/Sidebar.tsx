"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/", label: "Dashboard", icon: "◆" },
  { href: "/scanner", label: "Chart Scanner", icon: "▣" },
  { href: "/setups", label: "AI Setups", icon: "▲" },
  { href: "/risk", label: "Risk Calculator", icon: "◎" },
  { href: "/journal", label: "Journal", icon: "▤" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="flex min-h-screen w-56 flex-col border-r border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-5 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 text-sm font-bold text-black">
            TV
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide text-white">Trading Vault</h1>
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Private workspace</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                isActive
                  ? "border border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
                  : "text-[var(--muted)] hover:bg-[var(--card-hover)] hover:text-white"
              }`}
            >
              <span className="text-base opacity-80">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] px-4 py-4">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <span>Private account</span>
        </div>
        <p className="mt-1 text-[10px] text-[var(--muted)]">Manual MT5 • Analysis only</p>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-4 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--muted)] transition hover:border-cyan-500/40 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
