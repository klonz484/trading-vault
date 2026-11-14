"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError("Sign-in failed. Check your email and password, then try again.");
        return;
      }

      setMessage("Signed in. Opening your private workspace…");
      router.replace("/");
      router.refresh();
    } catch {
      setError("Account sign-in is not configured yet. Development Supabase settings are required.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="panel w-full max-w-md p-6 sm:p-8">
        <Link href="/" className="eyebrow inline-flex">OEM+ / Trading Vault</Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Access your private trading workspace. Your journal, scenarios and chart files are isolated to your account.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="field-label">
            Email address
            <input
              className="field-control"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              required
            />
          </label>
          <label className="field-label">
            Password
            <input
              className="field-control"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}

          <button className="btn-primary w-full" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in securely"}
          </button>
        </form>

        <div className="mt-6 border-t border-white/[0.08] pt-5">
          <p className="text-xs leading-5 text-slate-500">
            Public registration is intentionally closed while account security is being finalized. If you do not yet have an account, one must be provisioned by the workspace owner.
          </p>
          <Link href="/" className="mt-4 inline-flex text-xs text-slate-300 hover:text-white">Back to workspace</Link>
        </div>
      </section>
    </main>
  );
}
