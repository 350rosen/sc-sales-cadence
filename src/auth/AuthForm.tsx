// src/auth/AuthForm.tsx
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import logo from "../assets/suncaddy-logo.png";

export default function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setMsg("Signing in…");
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-sm rounded-xl border border-sc-delft/15 bg-white p-6 shadow-md">
      {/* Logo + heading */}
      <div className="flex flex-col items-center mb-4">
        <img src={logo} alt="SunCaddy" className="h-12 w-auto mb-2" />
        <h1 className="text-lg font-semibold text-sc-delft">Sign in to Sales Cadence</h1>
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="text-sm block">
          Email
          <input
            type="email"
            required
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="text-sm block">
          Password
          <input
            type="password"
            required
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            minLength={6}
          />
        </label>

        {err && <div className="text-xs text-red-600">{err}</div>}
        {msg && <div className="text-xs text-emerald-700">{msg}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-sc-green px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Please wait…" : "Sign in"}
        </button>
      </form>

      {/* No sign-up / no forgot-password links */}
    </div>
  );
}
