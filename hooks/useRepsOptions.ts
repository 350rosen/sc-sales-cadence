// hooks/useRepsOptions.ts
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export type RepOption = {
  key: string;                 // stable key (id or email)
  id?: string | null;          // profiles.id if available
  email?: string | null;
  name: string;                // best-available name
  source: "profiles" | "commission_schedule" | "merged";
  avatar_url?: string | null;  // if you store it in profiles
  active?: boolean | null;
};

type ProfilesRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  active?: boolean | null;
  role?: string | null; // optional—if you store roles
  is_rep?: boolean | null; // optional—if you flag reps
};

type CommissionRow = {
  rep_id?: string | null;      // if you store a user id
  rep_email?: string | null;
  rep_name?: string | null;
  active?: boolean | null;
};

export function useRepsOptions() {
  const [data, setData] = useState<RepOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      // 1) Profiles
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, active, role, is_rep");

      if (pErr) {
        if (!cancelled) setError(`profiles: ${pErr.message}`);
      }

      // 2) Commission schedule
      const { data: comms, error: cErr } = await supabase
        .from("commission_schedule")
        .select("rep_id, rep_email, rep_name, active");

      if (cErr) {
        if (!cancelled) setError(prev => (prev ? `${prev} | commission_schedule: ${cErr.message}` : `commission_schedule: ${cErr.message}`));
      }

      // Normalize
      const fromProfiles: RepOption[] = (profiles || []).map((p: ProfilesRow) => ({
        key: p.id || p.email || crypto.randomUUID(),
        id: p.id,
        email: p.email || null,
        name: (p.full_name && p.full_name.trim()) || (p.email ?? "Unnamed rep"),
        source: "profiles",
        avatar_url: p.avatar_url ?? null,
        active: p.active ?? null,
      }));

      const fromComms: RepOption[] = (comms || []).map((r: CommissionRow) => ({
        key: r.rep_id || r.rep_email || crypto.randomUUID(),
        id: r.rep_id ?? null,
        email: r.rep_email ?? null,
        name: (r.rep_name && r.rep_name.trim()) || (r.rep_email ?? "Unnamed rep"),
        source: "commission_schedule",
        avatar_url: null,
        active: r.active ?? null,
      }));

      // 3) Merge by email first, then by id
      const byKey = new Map<string, RepOption>();

      // seed with profiles (preferred)
      for (const rep of fromProfiles) {
        const k = rep.email || rep.id || rep.key;
        byKey.set(k, rep);
      }

      // fold in commission rows
      for (const rep of fromComms) {
        const k = rep.email || rep.id || rep.key;
        if (byKey.has(k)) {
          const existing = byKey.get(k)!;
          // prefer profiles data, but fill missing fields from commission_schedule
          byKey.set(k, {
            ...existing,
            source: "merged",
            active: existing.active ?? rep.active ?? null,
            // leave name/avatar from profiles if present
          });
        } else {
          byKey.set(k, rep);
        }
      }

      // Optional: filter to only active reps, if you store that flag
      const merged = Array.from(byKey.values())
        // .filter(r => r.active !== false) // enable if you want to hide inactive
        .sort((a, b) => a.name.localeCompare(b.name));

      if (!cancelled) {
        setData(merged);
        setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  return { reps: data, loading, error };
}
