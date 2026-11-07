"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });

      if (resetError) throw resetError;

      // Keep the response generic so the page does not disclose whether an account exists.
      setMessage("If an account exists for that email, a password-reset link will be sent. Check your inbox.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to request a reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#070b12] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-2xl border border-cyan-400/20 bg-[#0d1420] p-7 shadow-2xl shadow-cyan-950/20">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Trading Vault</p>
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="mt-2 text-sm text-slate-400">Enter the email address associated with your trader account.</p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <label className="block text-sm text-slate-300">
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-[#080e18] px-3 py-3 text-white outline-none transition focus:border-cyan-400"
              placeholder="you@example.com"
            />
          </label>

          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
          {message && <p role="status" className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm text-cyan-200">{message}</p>}

          <button type="submit" disabled={loading} className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          <Link href="/login" className="font-semibold text-cyan-300 hover:text-cyan-200">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
