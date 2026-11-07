"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const mainItems = [
  { href: "/", label: "Dashboard", icon: "⌂" },
  { href: "/scanner", label: "Chart Scanner", icon: "⌗" },
  { href: "/setups", label: "AI Setups", icon: "◇" },
  { href: "/journal", label: "Trading Journal", icon: "▤" },
];
const toolItems = [
  { href: "/risk", label: "Risk Calculator", icon: "▦" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const linkClass = (href: string) => {
    const active = pathname === href;
    return `group flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-all focus-ring ${
      active
        ? "border border-white/15 bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12)]"
        : "border border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-white"
    }`;
  };

  return (
    <>
      <aside className={`hidden md:flex md:sticky md:top-0 md:h-screen md:flex-col border-r border-white/[0.08] bg-[#0d1015]/95 backdrop-blur-xl transition-[width] duration-200 ${collapsed ? "md:w-[82px]" : "md:w-[248px]"}`}>
        <div className="flex h-[88px] items-center justify-between border-b border-white/[0.08] px-5">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="OEM+ ChartScanner home">
            <span className="platinum-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl italic text-white">O</span>
            {!collapsed && <span className="min-w-0"><span className="block platinum-text text-[22px] font-light italic tracking-tight">OEM+</span><span className="block text-[9px] uppercase tracking-[.2em] text-slate-500">ChartScanner</span></span>}
          </Link>
          <button onClick={() => setCollapsed(!collapsed)} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white" aria-label="Toggle sidebar">{collapsed ? "»" : "«"}</button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {!collapsed && <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-600">Workspace</p>}
          {mainItems.map(item => <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={linkClass(item.href)}><span className="w-6 text-center text-xl">{item.icon}</span>{!collapsed && <span className="font-medium">{item.label}</span>}{pathname === item.href && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white" />}</Link>)}
          {!collapsed && <p className="mb-3 mt-8 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-600">Trading tools</p>}
          {toolItems.map(item => <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={linkClass(item.href)}><span className="w-6 text-center text-xl">{item.icon}</span>{!collapsed && <span className="font-medium">{item.label}</span>}</Link>)}
        </nav>
        <div className="border-t border-white/[0.08] p-4">
          <div className={`flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 ${collapsed ? "justify-center" : ""}`}><span className="h-2 w-2 rounded-full bg-amber-400" />{!collapsed && <span className="text-xs text-slate-400">Market data status: verify source</span>}</div>
          {!collapsed && <p className="mt-3 text-[10px] text-slate-600">Manual execution · MT5</p>}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-white/[0.08] bg-[#0b0e13]/90 px-4 backdrop-blur-xl md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="platinum-mark flex h-9 w-9 items-center justify-center rounded-full text-lg italic">O</span>
          <span><span className="block platinum-text text-xl font-light italic">OEM+</span><span className="-mt-1 block text-[8px] uppercase tracking-[.2em] text-slate-500">ChartScanner</span></span>
        </Link>
        <div className="flex items-center gap-2"><span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-400">MT5 · Manual</span><button onClick={() => setMoreOpen(!moreOpen)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300" aria-label="Open more navigation">•••</button></div>
      </header>

      <nav className="mobile-safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-[#0b0e13]/95 px-2 pt-2 backdrop-blur-xl md:hidden">
        {[{href:"/",label:"Home",icon:"⌂"},{href:"/scanner",label:"Scan",icon:"⌗"},{href:"/setups",label:"Setups",icon:"◇"},{href:"/journal",label:"Journal",icon:"▤"},{href:"/risk",label:"More",icon:"•••"}].map(item => <Link key={item.href} href={item.href} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] ${pathname === item.href ? "text-white" : "text-slate-500"}`}><span className="text-xl leading-none">{item.icon}</span><span className={pathname === item.href ? "font-semibold" : ""}>{item.label}</span></Link>)}
      </nav>
      {moreOpen && <div className="fixed bottom-20 right-3 z-50 w-52 rounded-2xl border border-white/10 bg-[#171b23] p-2 shadow-2xl md:hidden"><Link href="/risk" onClick={() => setMoreOpen(false)} className="block rounded-lg px-3 py-3 text-sm text-slate-200">Risk Calculator</Link><Link href="/setups" onClick={() => setMoreOpen(false)} className="block rounded-lg px-3 py-3 text-sm text-slate-200">AI Setups</Link></div>}
    </>
  );
}
