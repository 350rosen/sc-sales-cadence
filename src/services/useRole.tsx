// src/services/useRole.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export type UserRole = "admin" | "rep" | "unknown";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole | null;
};

export function useRole() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole>("unknown");
  const [loading, setLoading] = useState(true);
  const [debug, setDebug] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setDebug("");

      const { data: sess } = await supabase.auth.getSession();
      const s = sess?.session ?? null;
      if (cancelled) return;
      setSession(s);

      const user = s?.user;
      if (!user) {
        setProfile(null);
        setRole("unknown");
        setLoading(false);
        return;
      }

      setDebug(`auth.uid=${user.id}, email=${user.email}`);

      // 1) Try by id
      let { data: p, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("id", user.id)
        .maybeSingle();

      // 2) Fallback to email if not found
      if (!p && !error) {
        const byEmail = await supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .eq("email", user.email)
          .maybeSingle();
        p = byEmail.data ?? null;
        error = byEmail.error ?? null;
        if (p) setDebug((d) => d + " | matched by email");
      }

      if (!cancelled) {
        if (error) setDebug((d) => d + ` | profiles error: ${error.message}`);
        setProfile(p as Profile | null);
        setRole(((p?.role as UserRole) ?? "rep")); // default to rep
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { role, profile, loading, session, debug };
}
