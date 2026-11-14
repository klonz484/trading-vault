"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const primary=[
 {href:"/",label:"Dashboard",icon:"⌂"},
 {href:"/scanner",label:"Chart Scanner",icon:"⌗"},
 {href:"/brain",label:"Trading Brain",icon:"◈"},
 {href:"/setups",label:"Upcoming Signals",icon:"◇"},
 {href:"/journal",label:"Trading Journal",icon:"▤"},
 {href:"/analytics",label:"Analytics",icon:"▥"},
];
const tools=[
 {href:"/risk",label:"Risk Calculator",icon:"⊞"},
 {href:"/market",label:"Market Overview",icon:"◎"},
 {href:"/history",label:"Scan History",icon:"◷"},
];
const account=[
 {href:"/profile",label:"My Profile",icon:"○"},
 {href:"/settings",label:"Settings",icon:"⚙"},
];

function DesktopLink({href,label,icon,collapsed=false}:{href:string;label:string;icon:string;collapsed?:boolean}){
 const pathname=usePathname();
 const active=href==="/" ? pathname==="/" : pathname===href||pathname.startsWith(href+"/");
 return <Link href={href} title={collapsed?label:undefined} aria-current={active?"page":undefined}
  className={"nav-link group "+(active?"nav-link-active":"")}>
  <span className="nav-glyph">{icon}</span>
  {!collapsed&&<span className="min-w-0 flex-1">{label}</span>}
  {active&&!collapsed&&<span className="nav-active-dot"/>}
 </Link>;
}

export default function Sidebar(){
 const pathname=usePathname();
 const [collapsed,setCollapsed]=useState(false);
 const [moreOpen,setMoreOpen]=useState(false);
 const mobileItems=[{href:"/",label:"Home",icon:"⌂"},{href:"/scanner",label:"Scan",icon:"⌗"},{href:"/brain",label:"Brain",icon:"◈"},{href:"/journal",label:"Journal",icon:"▤"}];
 const extraItems=[...primary.slice(3),...tools,...account];
 return <>
  <aside className={"desktop-rail sticky top-0 hidden h-screen shrink-0 flex-col transition-[width] duration-300 md:flex "+(collapsed?"w-[82px]":"w-[258px]")}>
   <div className="flex h-[88px] shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
    <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="OEM+ ChartScanner home">
     <span className="platinum-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[21px] font-light italic text-white">O</span>
     {!collapsed&&<span className="min-w-0"><span className="platinum-text block text-[23px] font-light italic tracking-tight">OEM+</span><span className="block text-[9px] uppercase tracking-[.23em] text-slate-500">ChartScanner</span></span>}
    </Link>
    <button onClick={()=>setCollapsed(!collapsed)} className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white" aria-label={collapsed?"Expand sidebar":"Collapse sidebar"}>{collapsed?"»":"«"}</button>
   </div>
   <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
    {!collapsed&&<p className="nav-section-label">Workspace</p>}
    {primary.map(item=><DesktopLink key={item.href} {...item} collapsed={collapsed}/>)}
    {!collapsed&&<p className="nav-section-label nav-section-spaced">Trading tools</p>}
    {tools.map(item=><DesktopLink key={item.href} {...item} collapsed={collapsed}/>)}
    {!collapsed&&<p className="nav-section-label nav-section-spaced">Account</p>}
    {account.map(item=><DesktopLink key={item.href} {...item} collapsed={collapsed}/>)}
   </nav>
   <div className="shrink-0 border-t border-white/[0.07] p-4">
    <div className={"flex items-center gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-3 "+(collapsed?"justify-center":"")}>
     <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,.3)]"/>
     {!collapsed&&<span className="text-[10px] leading-4 text-slate-400">Market feed not connected</span>}
    </div>
    {!collapsed&&<p className="mt-3 text-[10px] tracking-wide text-slate-600">MANUAL EXECUTION · MT5</p>}
   </div>
  </aside>

  <header className="mobile-topbar sticky top-0 z-30 flex h-[68px] items-center justify-between px-4 backdrop-blur-xl md:hidden">
   <Link href="/" className="flex items-center gap-2" aria-label="OEM+ home">
    <span className="platinum-mark flex h-9 w-9 items-center justify-center rounded-full text-lg font-light italic text-white">O</span>
    <span><span className="platinum-text block text-xl font-light italic">OEM+</span><span className="-mt-1 block text-[8px] uppercase tracking-[.2em] text-slate-500">ChartScanner</span></span>
   </Link>
   <div className="flex items-center gap-2"><span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-400">MT5 · Manual</span>
    <button onClick={()=>setMoreOpen(!moreOpen)} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300" aria-expanded={moreOpen} aria-label="Open more navigation">•••</button>
   </div>
  </header>

  <nav aria-label="Mobile navigation" className="mobile-safe-bottom mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 px-2 pt-2 backdrop-blur-xl md:hidden">
   {mobileItems.map(item=>{const active=item.href==="/" ? pathname==="/" : pathname===item.href||pathname.startsWith(item.href+"/");return <Link key={item.href} href={item.href} aria-current={active?"page":undefined} className={"mobile-nav-item "+(active?"mobile-nav-active":"")}><span className="text-xl leading-none">{item.icon}</span><span>{item.label}</span></Link>;})}
   <button onClick={()=>setMoreOpen(!moreOpen)} className={"mobile-nav-item "+(moreOpen?"mobile-nav-active":"")} aria-expanded={moreOpen}><span className="text-xl leading-none">•••</span><span>More</span></button>
  </nav>

  {moreOpen&&<>
   <button aria-label="Close navigation menu" className="fixed inset-0 z-40 bg-black/55 md:hidden" onClick={()=>setMoreOpen(false)}/>
   <div className="mobile-more-menu fixed bottom-[82px] right-3 z-50 max-h-[70vh] w-[min(310px,calc(100vw-24px))] overflow-y-auto rounded-2xl p-3 shadow-2xl md:hidden">
    <p className="px-2 pb-2 text-[9px] font-semibold uppercase tracking-[.2em] text-slate-500">Explore workspace</p>
    {extraItems.map(item=><Link key={item.href} href={item.href} onClick={()=>setMoreOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06]"><span className="w-6 text-center text-slate-400">{item.icon}</span>{item.label}</Link>)}
   </div>
  </>}
 </>;
}
