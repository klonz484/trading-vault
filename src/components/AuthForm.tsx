"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AuthFormProps = {
  mode: "login" | "signup";
};

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const supabase = createClient();

      if (isSignup) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (signUpError) throw signUpError;

        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setMessage("Check your email for the confirmation link before signing in.");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        const next = searchParams.get("next");
        const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
        router.replace(destination);
        router.refresh();
      }
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
        <h1 className="text-2xl font-bold">{isSignup ? "Create your trader account" : "Welcome back"}</h1>
        <p className="mt-2 text-sm text-slate-400">
          {isSignup
            ? "Create a private workspace for your scans, journal and trading progress."
            : "Sign in to access your private trading workspace."}
        </p>

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
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-[#080e18] px-3 py-3 text-white outline-none transition focus:border-cyan-400"
              placeholder="At least 8 characters"
            />
          </label>

          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
          {message && <p role="status" className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm text-cyan-200">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {isSignup ? "Already registered? " : "New to Trading Vault? "}
          <Link href={isSignup ? "/login" : "/signup"} className="font-semibold text-cyan-300 hover:text-cyan-200">
            {isSignup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </section>
    </main>
  );
}
