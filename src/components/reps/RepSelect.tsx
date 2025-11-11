// components/reps/RepSelect.tsx
import { useMemo } from "react";
import { useRepsOptions, RepOption } from "../../hooks/useRepsOptions";
import { clsx } from "clsx";

type Props = {
  value?: string | null; // key (email or id)—store this on your deal as account_rep
  onChange: (value: string | null, rep?: RepOption) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

export default function RepSelect({ value, onChange, disabled, className, placeholder = "Select a rep…" }: Props) {
  const { reps, loading, error } = useRepsOptions();

  const options = useMemo(() => reps.map(r => ({
    key: r.email || r.id || r.key,
    label: r.name + (r.email ? ` — ${r.email}` : ""),
    rep: r,
  })), [reps]);

  // keep value stable if key changed format
  const current = useMemo(
    () => options.find(o => o.key === value) ?? null,
    [options, value]
  );

  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      <label className="text-sm font-medium text-neutral-600">Rep</label>

      <select
        className="w-full rounded-xl border px-3 py-2 text-sm"
        disabled={disabled || loading}
        value={current?.key ?? ""}
        onChange={(e) => {
          const key = e.target.value || null;
          const rep = options.find(o => o.key === key)?.rep;
          onChange(key, rep);
        }}
      >
        <option value="">{loading ? "Loading reps…" : (placeholder || "Select a rep…")}</option>
        {options.map(o => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>

      {error && <p className="text-xs text-red-600">Failed to load reps: {error}</p>}
    </div>
  );
}
