import Link from "next/link";
import Sidebar from "@/components/Sidebar";

export default function ProfilePage() {
  return <div className="min-h-screen md:flex"><Sidebar /><main className="min-w-0 flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pt-8"><div className="mx-auto max-w-4xl">
    <div className="mb-7"><p className="eyebrow">Account</p><h1 className="page-title">My Profile</h1><p className="page-subtitle">Your private Trading Vault workspace.</p></div>
    <section className="panel p-5 sm:p-7"><div className="flex items-center gap-4"><div className="platinum-mark flex h-16 w-16 items-center justify-center rounded-full text-2xl font-light italic text-white">O</div><div><h2 className="text-lg font-semibold text-white">Trading Vault owner</h2><p className="mt-1 text-xs text-slate-500">Profile details will appear when account authentication is connected.</p></div></div><div className="mt-6 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4"><p className="text-sm font-medium text-amber-200">Account service not connected in this build</p><p className="mt-1 text-xs leading-5 text-slate-400">This redesign does not create accounts, change registration, or alter your existing authentication settings. Profile editing and multi-user access require the separately configured authentication service.</p></div><div className="mt-5 flex flex-wrap gap-2"><Link href="/settings" className="btn-primary">Workspace settings</Link><Link href="/" className="btn-secondary">Back to dashboard</Link></div></section>
  </div></main></div>;
}
