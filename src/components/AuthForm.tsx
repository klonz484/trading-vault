"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const accessNotice = (() => {
    switch (searchParams.get("error")) {
      case "owner_only":
        return "This Trading Vault workspace is restricted to its owner account.";
      case "owner_config_missing":
        return "Owner access has not been configured for this deployment yet.";
      case "sign_in_required":
        return "Please sign in with the owner account to continue.";
      default:
        return "";
    }
  })();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      const next = searchParams.get("next");
      const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.replace(destination);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#070b12] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-2xl border border-cyan-400/20 bg-[#0d1420] p-7 shadow-2xl shadow-cyan-950/20">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Trading Vault</p>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">
          Sign in to access your private trading workspace.
        </p>

        {accessNotice && (
          <p role="status" className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
            {accessNotice}
          </p>
        )}

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

          <label className="block text-sm text-slate-300">
            Password
            <input
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-[#080e18] px-3 py-3 text-white outline-none transition focus:border-cyan-400"
              placeholder="Your password"
            />
          </label>

          <div className="text-right text-sm">
            <Link href="/forgot-password" className="font-semibold text-cyan-300 hover:text-cyan-200">
              Forgot password?
            </Link>
          </div>

          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Please wait..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
