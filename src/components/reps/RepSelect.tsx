import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Rep = {
  id: string;
  name: string;
  email: string | null;
};

export default function RepSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string | null;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [reps, setReps] = useState<Rep[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("reps")   // <-- your reps table
        .select("id, name, email")
        .order("name");

      if (data) setReps(data as Rep[]);
    })();
  }, []);

  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-neutral-700">
        Rep
      </label>

      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border px-3 py-2 text-sm"
      >
        {reps.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} — {r.email}
          </option>
        ))}
      </select>
    </div>
  );
}
