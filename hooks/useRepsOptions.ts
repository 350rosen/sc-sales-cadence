// src/hooks/useRepsOptions.ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export type RepOption = {
  key: string;
  id?: string | null;
  email?: string | null;
  name: string;
  source: "profiles" | "commission_schedule" | "merged";
  active?: boolean | null;
};

type ProfilesRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  active?: boolean | null;
  role?: string | null;
  is_rep?: boolean | null;
};

type CommissionRow = {
  rep_id?: string | null;
  rep_email?: string | null;
  rep_name?: string | null;
  active?: boolean | null;
};

function bestRepKey(r: { email?: string | null; id?: string | null; key: string }) {
  return r.email || r.id || r.key;
}

export function useRepsOptions() {
  const [reps, setReps] = useState<RepOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, active, role, is_rep");

      const { data: comms, error: cErr } = await supabase
        .from("commission_schedule")
        .select("rep_id, rep_email, rep_name, active");

      if (pErr || cErr) {
        const msg = [
          pErr ? `profiles: ${pErr.message}` : null,
          cErr ? `commission_schedule: ${cErr.message}` : null,
        ].filter(Boolean).join(" | ");
        if (!cancelled) setError(msg || "Failed to load reps");
      }

      const fromProfiles: RepOption[] = (profiles || []).map((p: ProfilesRow) => ({
        key: p.email || p.id || crypto.randomUUID(),
        id: p.id,
        email: p.email || null,
        name: (p.full_name && p.full_name.trim()) || p.email || "Unnamed rep",
        source: "profiles",
        active: p.active ?? null,
      }));

      const fromComms: RepOption[] = (comms || []).map((r: CommissionRow) => ({
        key: r.rep_email || r.rep_id || crypto.randomUUID(),
        id: r.rep_id ?? null,
        email: r.rep_email ?? null,
        name: (r.rep_name && r.rep_name.trim()) || r.rep_email || "Unnamed rep",
        source: "commission_schedule",
        active: r.active ?? null,
      }));

      const map = new Map<string, RepOption>();
      fromProfiles.forEach((rep) => map.set(bestRepKey(rep), rep));
      fromComms.forEach((rep) => {
        const k = bestRepKey(rep);
        if (map.has(k)) {
          const ex = map.get(k)!;
          map.set(k, { ...ex, source: "merged", active: ex.active ?? rep.active ?? null });
        } else {
          map.set(k, rep);
        }
      });

      const merged = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      if (!cancelled) {
        setReps(merged);
        setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  return { reps, loading, error };
}
