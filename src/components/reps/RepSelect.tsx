// src/components/reps/RepSelect.tsx
import { useMemo } from "react";
import { useRepsOptions, type RepOption } from "../../hooks/useRepsOptions";

function bestRepKey(r: { email?: string | null; id?: string | null; key: string }) {
  return r.email || r.id || r.key;
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
      reps.map((r): { key: string; label: string; rep: RepOption } => ({
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
          const rep = options.find((o) => o.key === key)?.rep;
          onChange(key, rep);
        }}
      >
        <option value="">{loading ? "Loading reps…" : placeholder}</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">Failed to load reps: {error}</p>}
    </div>
  );
}
