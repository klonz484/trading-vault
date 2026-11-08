import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import {
  getBrainSkillReadiness,
  getBrainSkillsByGroup,
  type BrainSkillGroup,
} from "@/lib/trading-brain/skills/registry";

const groups: {
  id: BrainSkillGroup;
  title: string;
  detail: string;
}[] = [
  { id: "CORE_ANALYSIS", title: "Core market analysis", detail: "Structure, liquidity, institutional zones, indicators and pattern recognition." },
  { id: "CONTEXT", title: "Market context", detail: "Multi-timeframe alignment, sessions, instrument conventions and fundamental context." },
  { id: "RISK", title: "Risk and trade planning", detail: "Entry geometry, invalidation, sizing inputs and risk constraints." },
  { id: "LEARNING", title: "Learning and research", detail: "Backtesting, private performance review and controlled strategy discovery." },
  { id: "QUALITY", title: "Evidence and quality control", detail: "Data readiness, contradictions and calibrated confidence." },
  { id: "ORCHESTRATION", title: "Knowledge and orchestration", detail: "Scenario comparison, versioning, experiments and owner-governed changes." },
  { id: "SCALPING", title: "Scalping research", detail: "Microstructure, short-horizon patterns, costs, latency, context and discipline." },
];

const statusLabel: Record<string, string> = {
  PLANNED: "Planned",
  IN_DEVELOPMENT: "In development",
  IMPLEMENTED: "Implemented · not yet tested",
  TESTED: "Tested · not enabled",
  ENABLED: "Enabled",
};

export default function TradingBrainPage() {
  const readiness = getBrainSkillReadiness();

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8">
        <div className="mx-auto max-w-[1450px]">
          <header className="mb-7">
            <p className="eyebrow">OEM+ Intelligence</p>
            <h1 className="page-title">Trading Brain</h1>
            <p className="page-subtitle">An independent analytical engine that collaborates with the Scanner without becoming the Scanner.</p>
          </header>

          <section className="panel relative mb-6 overflow-hidden p-5 sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr] lg:items-center">
              <div>
                <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[.18em] text-slate-300">Hybrid intelligence architecture</span>
                <h2 className="mt-4 max-w-2xl text-3xl font-light leading-tight text-white sm:text-4xl">Think in evidence.<br /><span className="platinum-text font-medium">Learn through experiments.</span></h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">The Brain evaluates market context, supporting and opposing evidence, uncertainty and invalidation. It maintains an independent analytical path and can challenge Scanner findings.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="panel-soft p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Decision authority</p><p className="mt-2 text-lg font-semibold text-white">Collaborative</p><p className="mt-1 text-xs text-slate-500">Conflicts remain visible</p></div>
                <div className="panel-soft p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Learning policy</p><p className="mt-2 text-lg font-semibold text-white">Experiments</p><p className="mt-1 text-xs text-slate-500">Owner approval for shared changes</p></div>
              </div>
            </div>
          </section>

          <section className="panel mb-6 p-5 sm:p-6" aria-labelledby="readiness-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="eyebrow">Implementation transparency</p><h2 id="readiness-heading" className="section-title mt-1">Brain skill readiness</h2><p className="mt-1 text-xs text-slate-500">Live counts from the version-controlled skill registry. A registry status is not proof of analytical accuracy.</p></div>
              <span className="status-neutral">Directional Brain output locked</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {[
                ["Total skills", readiness.total],
                ["In development", readiness.inDevelopment],
                ["Planned", readiness.planned],
                ["Implemented", readiness.implemented],
                ["Tested", readiness.tested],
                ["Enabled", readiness.enabled],
              ].map(([label, value]) => <div key={label} className="panel-soft p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p></div>)}
            </div>
            <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] px-3 py-3 text-xs leading-5 text-amber-100/80">Safety state: the independent Brain assessment remains INCOMPLETE / INSUFFICIENT_EVIDENCE until the approved methodology, evidence gates and replay acceptance tests are complete. No directional signal is authorised by this dashboard.</p>
          </section>

          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="section-title">Intelligence capability map</h2><span className="status-neutral">Registry-backed</span></div>
          <div className="grid gap-4 xl:grid-cols-2">
            {groups.map((group) => {
              const skills = getBrainSkillsByGroup(group.id);
              return (
                <section className="panel min-w-0 p-5" key={group.id}>
                  <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{group.title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{group.detail}</p></div><span className="status-neutral shrink-0">{skills.length} skills</span></div>
                  <ul className="mt-4 divide-y divide-white/[0.06]">
                    {skills.map((skill) => (
                      <li className="py-3 first:pt-0 last:pb-0" key={skill.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-slate-200">{skill.name}</p><span className="status-neutral">{statusLabel[skill.status] ?? skill.status}</span></div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{skill.purpose}</p>
                        {skill.dependencies.length > 0 && <p className="mt-1 text-[10px] text-slate-600">Dependencies: {skill.dependencies.join(" · ")}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="panel p-5"><h2 className="section-title">Controlled learning policy</h2><ul className="mt-4 space-y-3 text-sm text-slate-300"><li className="flex gap-3"><span className="text-emerald-400">✓</span>Keep each experiment versioned and measurable.</li><li className="flex gap-3"><span className="text-emerald-400">✓</span>Preserve evidence and results behind every conclusion.</li><li className="flex gap-3"><span className="text-emerald-400">✓</span>Require owner review before shared Core Brain changes.</li><li className="flex gap-3"><span className="text-amber-300">!</span>No automatic strategy changes or live execution.</li></ul></section>
            <section className="panel p-5"><h2 className="section-title">Work with the Scanner</h2><p className="mt-2 text-sm leading-6 text-slate-400">The Scanner interprets the uploaded chart. The Brain must independently evaluate its own evidence and challenge the interpretation. Neither system silently overwrites the other.</p><div className="mt-5 flex flex-wrap gap-2"><Link className="btn-primary" href="/scanner">Open Chart Scanner</Link><Link className="btn-secondary" href="/setups">Review AI Setups</Link></div></section>
          </div>
          <p className="mt-6 text-xs leading-5 text-slate-500">This page reports implementation metadata only. It does not simulate live market conditions, claim strategy profitability, or authorise BUY/SELL decisions. Live market-data integration and the end-to-end production reasoning pipeline remain separate release gates.</p>
        </div>
      </main>
    </div>
  );
}
