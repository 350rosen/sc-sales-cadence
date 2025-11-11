import { useEffect, useMemo, useRef, useState } from "react";

export type StripeCustomerLite = { id: string; name: string; email: string };

type Props = {
  value?: string | null; // current Stripe customer id
  onChange: (id: string | null, lite?: StripeCustomerLite | null) => void;
  placeholder?: string;
  className?: string;
};

export default function CustomerSearchSelect({
  value,
  onChange,
  placeholder = "Search by name or email…",
  className,
}: Props) {
  const [query, setQuery] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<StripeCustomerLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<StripeCustomerLite | null>(null);
  const acRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Load selected (by id) on mount/when value changes
  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSelected(null);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/stripe/customers?id=${encodeURIComponent(value)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const full = (await res.json()) as any;
        if (!cancelled) {
          const lite: StripeCustomerLite = { id: full.id, name: full.name ?? "", email: full.email ?? "" };
          setSelected(lite);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  // Debounced search when dropdown is open
  useEffect(() => {
    if (!open) return;
    acRef.current?.abort();
    const controller = new AbortController();
    acRef.current = controller;

    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const url = query ? `/api/stripe/customers?q=${encodeURIComponent(query)}` : `/api/stripe/customers`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = (await res.json()) as StripeCustomerLite[];
        setOptions(list);
        setLoading(false);
      } catch (e: any) {
        if (e?.name !== "AbortError") setLoading(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [query, open]);

  // click outside to close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const displayValue = useMemo(() => {
    if (query) return query;
    if (!selected) return "";
    const label = selected.name || selected.email || selected.id;
    return label;
  }, [query, selected]);

  return (
    <div className={className} ref={boxRef}>
      <label className="mb-1 block text-sm font-medium text-neutral-700">Customer</label>
      <div className="relative">
        <input
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {open && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow">
            {loading && <div className="px-3 py-2 text-sm text-neutral-500">Searching…</div>}
            {!loading && options.length === 0 && (
              <div className="px-3 py-2 text-sm text-neutral-500">No results</div>
            )}
            {!loading &&
              options.map((opt) => {
                const label = opt.name || opt.email || opt.id;
                const sub = opt.name && opt.email ? opt.email : opt.name ? "" : opt.email;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                    onClick={() => {
                      setSelected(opt);
                      setQuery("");
                      setOpen(false);
                      onChange(opt.id, opt);
                    }}
                  >
                    <div className="font-medium">{label}</div>
                    {sub ? <div className="text-xs text-neutral-500">{sub}</div> : null}
                  </button>
                );
              })}
            {!loading && (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-xs text-neutral-500 hover:bg-neutral-50"
                onClick={() => {
                  setSelected(null);
                  setQuery("");
                  setOpen(false);
                  onChange(null, null);
                }}
              >
                Clear selection
              </button>
            )}
          </div>
        )}
      </div>
      {selected?.id ? (
        <p className="mt-1 text-xs text-neutral-500">
          Selected: {selected.name || selected.email} — {selected.id}
        </p>
      ) : null}
    </div>
  );
}
