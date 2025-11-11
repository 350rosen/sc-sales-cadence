// src/components/reps/RepSelect.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

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
  active?: boolean | null;
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

function useRepsOptions() {
  const [reps, setReps] = useState<RepOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, active");

      const { data: comms, error: cErr } = await supabase
        .from("commission_schedule")
        .select("rep_id, rep_email, rep_name, active");

      if (pErr || cErr) {
        const msg = [
          pErr ? `profiles: ${pErr.message}` : null,
          cErr ? `commission_schedule: ${cErr.message}` : null,
        ]
          .filter(Boolean)
          .join(" | ");
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
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { reps, loading, error };
}

type Props = {
  value?: string | null;
  onChange: (value: string | null, rep?: RepOption) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export default function RepSelect({
  value,
  onChange,
  disabled,
  placeholder = "Select a rep…",
  className,
}: Props) {
  const { reps, loading, error } = useRepsOptions();

  const options = useMemo(
    () =>
      reps.map((r: RepOption): { key: string; label: string; rep: RepOption } => ({
        key: bestRepKey(r),
        label: r.name + (r.email ? ` — ${r.email}` : ""),
        rep: r,
      })),
    [reps]
  );

  const currentKey: string = value ?? "";

  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-neutral-700">Rep</label>
      <select
        className="w-full rounded-xl border px-3 py-2 text-sm"
        disabled={disabled || loading}
        value={currentKey}
        onChange={(e) => {
          const key = e.target.value || null;
          const rep = options.find((o: { key: string }) => o.key === key)?.rep;
          onChange(key, rep);
        }}
      >
        <option value="">{loading ? "Loading reps…" : placeholder}</option>
        {options.map((o: { key: string; label: string }) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">Failed to load reps: {error}</p>}
    </div>
  );
}
