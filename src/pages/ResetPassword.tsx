// src/pages/ResetPassword.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false); // whether we can show the form
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Read tokens from hash (#...) OR query (?...)
  const tokens = useMemo(() => {
    const raw =
      (typeof window !== "undefined" && window.location.hash?.startsWith("#") && window.location.hash.slice(1)) ||
      (typeof window !== "undefined" && window.location.search?.startsWith("?") && window.location.search.slice(1)) ||
      "";
    const params = new URLSearchParams(raw);
    return {
      access_token: params.get("access_token") || undefined,
      refresh_token: params.get("refresh_token") || undefined,
      type: params.get("type") || undefined, // "invite" | "recovery"
    };
  }, []);

  // Establish session from tokens if present; otherwise allow if already signed in
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { access_token, refresh_token } = tokens;

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          // Clean URL (hide tokens)
          if (!cancelled) {
            window.history.replaceState({}, document.title, "/reset-password");
          }
          if (!cancelled) setAllowed(true);
        } else {
          // No tokens — allow if already signed in
          const { data } = await supabase.auth.getSession();
          if (!cancelled) setAllowed(Boolean(data.session));
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || "Could not validate link.");
          setAllowed(false);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tokens]);

  const canSubmit = useMemo(
    () => allowed && pw1.length >= 8 && pw1 === pw2 && !busy,
    [allowed, pw1, pw2, busy]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      setMsg("Password updated. You can now sign in with your new password.");
      // Optional redirect after success:
      // setTimeout(() => (window.location.href = "/"), 1000);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to set password.");
    } finally {
      setBusy(false);
    }
  };

  // Centered minimal layout
  if (!ready) {
    return (
      <FullCenter>
        <Card><p>Verifying your session…</p></Card>
      </FullCenter>
    );
  }

  if (!allowed) {
    return (
      <FullCenter>
        <Card>
          <h1 className="mb-2 text-lg font-semibold">Reset password</h1>
          <p className="text-sm text-red-600">Invalid or expired link. Please request a new one.</p>
        </Card>
      </FullCenter>
    );
  }

  return (
    <FullCenter>
      <Card>
        <h1 className="mb-4 text-2xl font-semibold text-center">Set Password</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-sm mb-1">New password</label>
            <input
              type="password"
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Confirm password</label>
            <input
              type="password"
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>

          {err && <div className="text-xs text-red-600">{err}</div>}
          {msg && <div className="text-xs text-emerald-700">{msg}</div>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      </Card>
    </FullCenter>
  );
}

/* ---- tiny UI helpers so this page is standalone and minimal ---- */

function FullCenter({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-sc-offwhite flex items-center justify-center">
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow">
      {children}
    </div>
  );
}
