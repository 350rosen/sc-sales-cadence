// src/pages/ResetPassword.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Detect the recovery link: it includes type=recovery in the URL hash
  useEffect(() => {
    const hash = window.location.hash || "";
    setIsRecovery(/type=recovery/.test(hash));
    setReady(true);
  }, []);

  const canSubmit = useMemo(
    () => isRecovery && pw1.length >= 6 && pw1 === pw2 && !busy,
    [isRecovery, pw1, pw2, busy]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      // This uses the short-lived session from the email link
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      setMsg("Password updated. You can now sign in with your new password.");
      // optional: redirect to sign-in after a short delay
      // setTimeout(() => (window.location.href = "/"), 1200);
    } catch (e: any) {
      setErr(e?.message ?? "Could not update password.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border bg-white p-6 shadow">
      <h1 className="mb-4 text-lg font-semibold">Reset password</h1>

      {!isRecovery ? (
        <div className="text-sm text-red-600">
          Invalid or expired reset link. Please request a new one.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-sm">
            New password
            <input
              type="password"
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              minLength={6}
              autoComplete="new-password"
              required
            />
          </label>
          <label className="block text-sm">
            Confirm password
            <input
              type="password"
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              minLength={6}
              autoComplete="new-password"
              required
            />
          </label>

          {err && <div className="text-xs text-red-600">{err}</div>}
          {msg && <div className="text-xs text-emerald-700">{msg}</div>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded bg-sc-green px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Updating…" : "Set new password"}
          </button>
        </form>
      )}
    </div>
  );
}
