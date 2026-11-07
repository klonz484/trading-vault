"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password,setPassword]=useState(""); const [confirmPassword,setConfirmPassword]=useState("");
  const [message,setMessage]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  async function handleSubmit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if(password.length<8){setError("Use at least 8 characters.");return;}
    if(password!==confirmPassword){setError("The passwords do not match.");return;}
    setLoading(true);
    try { const supabase=createClient(); const {error:updateError}=await supabase.auth.updateUser({password}); if(updateError)throw updateError;
      setMessage("Your password has been updated. You can now sign in with your new password."); setPassword(""); setConfirmPassword("");
    } catch(cause) { setError(cause instanceof Error?cause.message:"Unable to update your password. Request a new reset link and try again."); }
    finally {setLoading(false);}
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#08090c] px-5 py-12 text-white"><section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12151b] p-7 shadow-2xl">
    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">OEM+ ChartScanner</p><h1 className="text-2xl font-bold">Choose a new password</h1>
    <p className="mt-2 text-sm text-slate-400">Use at least 8 characters. This page requires a valid password-reset session.</p>
    <form onSubmit={handleSubmit} className="mt-7 space-y-4"><label className="block text-sm text-slate-300">New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-[#080e18] px-3 py-3 text-white outline-none focus:border-slate-300" /></label>
    <label className="block text-sm text-slate-300">Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-[#080e18] px-3 py-3 text-white outline-none focus:border-slate-300" /></label>
    {error&&<p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}{message&&<p role="status" className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-200">{message}</p>}
    <button type="submit" disabled={loading} className="w-full rounded-lg bg-slate-200 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60">{loading?"Updating...":"Update password"}</button></form>
    <p className="mt-6 text-center text-sm text-slate-400"><Link href="/" className="font-semibold text-slate-200">Back to Trading Vault</Link></p>
  </section></main>;
}
