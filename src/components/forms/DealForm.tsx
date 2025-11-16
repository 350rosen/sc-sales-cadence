import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

/* ---------------- Types ---------------- */
export type DealFormProps = {
  onDone?: () => void;
  defaultRepKey?: string | null; // optional rep ID from parent (e.g. current rep)
};

type DealInsert = {
  name: string | null;
  value: number | null;
  stage: "open";
  close_date: string | null;
  account_rep: string | null;
  main_contact_name: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  billing_contact_phone: string | null;
  stripe_customer_id?: string | null;
};

type StripeAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

type StripeCustomerFull = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: StripeAddress | null;
  shipping?: { address?: StripeAddress | null } | null;
};

type StripeCustomerLite = { id: string; name: string; email: string };

type RepProfile = {
  id: string;
  full_name: string | null;
  email: string;
  role: string | null;
};

/* ---------------- Helpers ---------------- */
const fmtAddr = (a?: StripeAddress | null) => {
  if (!a) return null;
  const parts = [
    a.line1,
    a.line2,
    [a.city, a.state].filter(Boolean).join(", "),
    a.postal_code,
    a.country,
  ].filter(Boolean);
  return parts.length ? parts.join(" • ") : null;
};

/* ---------------- Inline CustomerSearchSelect ---------------- */
function CustomerSearchSelect({
  value,
  onChange,
  placeholder = "Search by name or email…",
  className,
}: {
  value?: string | null;
  onChange: (id: string | null, lite?: StripeCustomerLite | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<StripeCustomerLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<StripeCustomerLite | null>(null);
  const acRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Load selected (by id) when value changes
  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSelected(null);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/stripe/customers?id=${encodeURIComponent(value)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const full = (await res.json()) as any;
        if (!cancelled) {
          const lite: StripeCustomerLite = {
            id: full.id,
            name: full.name ?? "",
            email: full.email ?? "",
          };
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

  // Debounced search
  useEffect(() => {
    if (!open) return;
    acRef.current?.abort();
    const controller = new AbortController();
    acRef.current = controller;

    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const url = query
          ? `/api/stripe/customers?q=${encodeURIComponent(query)}`
          : `/api/stripe/customers`;
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
      <label className="mb-1 block text-sm font-medium text-neutral-700">
        Customer
      </label>
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
            {loading && (
              <div className="px-3 py-2 text-sm text-neutral-500">
                Searching…
              </div>
            )}
            {!loading && options.length === 0 && (
              <div className="px-3 py-2 text-sm text-neutral-500">
                No results
              </div>
            )}
            {!loading &&
              options.map((opt) => {
                const label = opt.name || opt.email || opt.id;
                const sub =
                  opt.name && opt.email
                    ? opt.email
                    : opt.name
                    ? ""
                    : opt.email;
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
                    {sub ? (
                      <div className="text-xs text-neutral-500">{sub}</div>
                    ) : null}
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

/* ---------------- Stripe loader for address card ---------------- */
function useStripeCustomer(stripeCustomerId?: string | null) {
  const [cust, setCust] = useState<StripeCustomerFull | null>(null);
  const [loading, setLoading] = useState<boolean>(!!stripeCustomerId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!stripeCustomerId) {
      setCust(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/stripe/customers?id=${encodeURIComponent(stripeCustomerId)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const full = (await res.json()) as StripeCustomerFull;
        if (!cancelled) {
          setCust(full);
          setLoading(false);
        }
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : "Failed to load Stripe customer";
        if (!cancelled) {
          setError(msg);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stripeCustomerId]);

  return { customer: cust, loading, error };
}

/* ---------------- Main Component ---------------- */
export default function DealForm({
  onDone,
  defaultRepKey,
}: DealFormProps) {
  const [billingDifferent, setBillingDifferent] = useState<boolean>(false);

  const [repProfile, setRepProfile] = useState<RepProfile | null>(null);
  const [repLoading, setRepLoading] = useState<boolean>(true);

  const [deal, setDeal] = useState<DealInsert>({
    name: null,
    value: null,
    stage: "open",
    close_date: null,
    account_rep: defaultRepKey ?? null,
    main_contact_name: null,
    main_contact_email: null,
    main_contact_phone: null,
    billing_contact_name: null,
    billing_contact_email: null,
    billing_contact_phone: null,
    stripe_customer_id: null,
  });

  const {
    customer: stripe,
    loading: stripeLoading,
    error: stripeError,
  } = useStripeCustomer(deal.stripe_customer_id ?? null);

  // Auto-select rep based on logged-in user's email (profiles table)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: session, error: userError } =
          await supabase.auth.getUser();
        const email = session?.user?.email;
        if (userError || !email) {
          setRepLoading(false);
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id, email, role, full_name")
          .eq("email", email)
          .maybeSingle();

        if (!cancelled && !error && profile) {
          const p = profile as RepProfile;
          setRepProfile(p);
          setDeal((d) => ({
            ...d,
            account_rep: d.account_rep ?? p.id,
          }));
        }

        if (!cancelled) setRepLoading(false);
      } catch {
        if (!cancelled) setRepLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [defaultRepKey]);

  // Prefill main contact from Stripe; DO NOT touch account_rep here
  useEffect(() => {
    if (!stripe) return;
    setDeal((d) => ({
      ...d,
      name: stripe.name ?? d.name,
      main_contact_name: stripe.name ?? d.main_contact_name,
      main_contact_email: stripe.email ?? d.main_contact_email,
      main_contact_phone: stripe.phone ?? d.main_contact_phone,
    }));
  }, [stripe]);

  const shippingAddr = fmtAddr(stripe?.shipping?.address);
  const billingAddr = fmtAddr(stripe?.address);
  const anyAddr = shippingAddr || billingAddr;

  // Validation: must have customer, rep, value>0, close_date, main_contact name+email
  const saveDisabled = !(
    deal.stripe_customer_id &&
    deal.account_rep &&
    deal.value != null &&
    Number(deal.value) > 0 &&
    deal.close_date &&
    deal.main_contact_name &&
    deal.main_contact_email
  );

  const handleSave = useCallback(async () => {
    const payload = {
      name: deal.name,
      value: deal.value,
      stage: "open",
      close_date: deal.close_date,
      account_rep: deal.account_rep,
      main_contact_name: deal.main_contact_name,
      main_contact_email: deal.main_contact_email,
      main_contact_phone: deal.main_contact_phone,
      billing_contact_name: billingDifferent
        ? deal.billing_contact_name
        : deal.main_contact_name,
      billing_contact_email: billingDifferent
        ? deal.billing_contact_email
        : deal.main_contact_email,
      billing_contact_phone: billingDifferent
        ? deal.billing_contact_phone
        : deal.main_contact_phone,
      stripe_customer_id: deal.stripe_customer_id ?? null,
    };
    const { error } = await supabase.from("deals").insert(payload);
    if (error) {
      alert(error.message);
      return;
    }
    onDone?.();
  }, [deal, billingDifferent, onDone]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Add Deal</h3>
        <div className="text-xs text-neutral-500">
          {deal.stripe_customer_id
            ? `Stripe: ${deal.stripe_customer_id}`
            : "No Stripe customer"}
        </div>
      </div>

      {/* Single Customer field */}
      <CustomerSearchSelect
        value={deal.stripe_customer_id ?? null}
        onChange={(id: string | null, lite?: StripeCustomerLite | null) => {
          setDeal((d) => ({
            ...d,
            stripe_customer_id: id,
            name: lite?.name || lite?.email || null,
          }));
        }}
      />

      {/* Address card */}
      <div className="rounded-xl border bg-neutral-50 p-4">
        <p className="mb-1 text-xs font-semibold text-neutral-600">
          Customer Address (read-only)
        </p>
        {stripeLoading && (
          <p className="text-sm text-neutral-500">
            Loading Stripe details…
          </p>
        )}
        {!stripeLoading && stripeError && (
          <p className="text-sm text-red-600">
            Failed to load Stripe: {stripeError}
          </p>
        )}
        {!stripeLoading && !stripeError && (
          <>
            {anyAddr ? (
              <div className="space-y-1 text-sm">
                {shippingAddr && (
                  <div>
                    <span className="font-medium">Shipping:</span>{" "}
                    {shippingAddr}
                  </div>
                )}
                {billingAddr && (
                  <div>
                    <span className="font-medium">Billing:</span>{" "}
                    {billingAddr}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">
                No address on file.
              </p>
            )}
          </>
        )}
      </div>

      {/* Rep (read-only) + core fields */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Rep
          </label>
          <div className="w-full rounded-xl border bg-neutral-100 px-3 py-2 text-sm text-neutral-800">
            {repLoading
              ? "Loading rep…"
              : repProfile
              ? `${repProfile.full_name ?? repProfile.email} — ${
                  repProfile.email
                }`
              : "No rep profile found"}
          </div>
        </div>

        <div className="md:col-span-1">
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Value (USD)
          </label>
          <input
            type="number"
            step="0.01"
            min={0}
            placeholder="0.00"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={deal.value ?? ""}
            onChange={(e) =>
              setDeal((d) => ({
                ...d,
                value:
                  e.target.value === "" ? null : Number(e.target.value),
              }))
            }
          />
        </div>

        <div className="md:col-span-1">
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Close date
          </label>
          <input
            type="date"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={deal.close_date ?? ""}
            onChange={(e) =>
              setDeal((d) => ({
                ...d,
                close_date: e.target.value || null,
              }))
            }
          />
        </div>
      </div>

      {/* Main contact */}
      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-semibold text-neutral-700">
          Main contact
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Name"
            value={deal.main_contact_name ?? ""}
            onChange={(e) =>
              setDeal((d) => ({
                ...d,
                main_contact_name: e.target.value || null,
              }))
            }
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Email"
            type="email"
            value={deal.main_contact_email ?? ""}
            onChange={(e) =>
              setDeal((d) => ({
                ...d,
                main_contact_email: e.target.value || null,
              }))
            }
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Phone"
            value={deal.main_contact_phone ?? ""}
            onChange={(e) =>
              setDeal((d) => ({
                ...d,
                main_contact_phone: e.target.value || null,
              }))
            }
          />
        </div>
      </div>

      {/* Billing contact toggle */}
      <div className="flex items-center gap-2">
        <input
          id="billingDifferent"
          type="checkbox"
          className="h-4 w-4 rounded border"
          checked={billingDifferent}
          onChange={(e) => setBillingDifferent(e.target.checked)}
        />
        <label
          htmlFor="billingDifferent"
          className="text-sm text-neutral-800"
        >
          Billing contact is different
        </label>
      </div>

      {billingDifferent && (
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-semibold text-neutral-700">
            Billing contact
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="Name"
              value={deal.billing_contact_name ?? ""}
              onChange={(e) =>
                setDeal((d) => ({
                  ...d,
                  billing_contact_name: e.target.value || null,
                }))
              }
            />
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="Email"
              type="email"
              value={deal.billing_contact_email ?? ""}
              onChange={(e) =>
                setDeal((d) => ({
                  ...d,
                  billing_contact_email: e.target.value || null,
                }))
              }
            />
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="Phone"
              value={deal.billing_contact_phone ?? ""}
              onChange={(e) =>
                setDeal((d) => ({
                  ...d,
                  billing_contact_phone: e.target.value || null,
                }))
              }
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
          disabled={saveDisabled}
          onClick={handleSave}
        >
          Save Deal
        </button>
      </div>
    </div>
  );
}
