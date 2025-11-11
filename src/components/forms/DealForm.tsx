// components/forms/DealForm.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";

/* ===================== Types ===================== */

type Props = {
  onDone: () => void;
  defaultRepKey?: string | null;  // email or id to preselect
  lockRep?: boolean;              // if true, disables Rep select
  stripeCustomerId?: string | null; // if provided, shows Stripe address (fetched)
};

type DealInsert = {
  name: string | null;                  // company / deal name
  value: number | null;                 // USD
  stage: "open" | "paid" | null;
  close_date: string | null;            // yyyy-mm-dd
  account_rep: string | null;           // email or profiles.id (your choice)
  // contacts:
  main_contact_name: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  billing_contact_phone: string | null;
  stripe_customer_id?: string | null;
};

type RepOption = {
  key: string;               // primary key we store on deals.account_rep
  id?: string | null;        // profiles.id if available
  email?: string | null;
  name: string;              // display name
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

type StripeAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

type StripeCustomerLite = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: StripeAddress | null;
  shipping?: { address?: StripeAddress | null } | null;
};

/* ===================== Helpers ===================== */

function bestRepKey(r: { email?: string | null; id?: string | null; key: string }) {
  return r.email || r.id || r.key;
}

function fmtAddr(a?: StripeAddress | null) {
  if (!a) return null;
  const parts = [
    a.line1,
    a.line2,
    [a.city, a.state].filter(Boolean).join(", "),
    a.postal_code,
    a.country,
  ].filter(Boolean);
  if (!parts.length) return null;
  return parts.join(" • ");
}

/* ===================== Data: reps (profiles + commission_schedule) ===================== */

function useRepsOptions() {
  const [reps, setReps] = useState<RepOption[]>([]);
  const [loading, setLoading] = useState(true);
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
        if (!cancelled) {
          const msg = [
            pErr ? `profiles: ${pErr.message}` : null,
            cErr ? `commission_schedule: ${cErr.message}` : null,
          ]
            .filter(Boolean)
            .join(" | ");
          setError(msg || "Failed to load reps");
        }
      }

      const fromProfiles: RepOption[] = (profiles || []).map((p: ProfilesRow) => ({
        key: p.email || p.id || crypto.randomUUID(),
        id: p.id,
        email: p.email || null,
        name: (p.full_name && p.full_name.trim()) || (p.email ?? "Unnamed rep"),
        source: "profiles",
        active: p.active ?? null,
      }));

      const fromComms: RepOption[] = (comms || []).map((r: CommissionRow) => ({
        key: r.rep_email || r.rep_id || crypto.randomUUID(),
        id: r.rep_id ?? null,
        email: r.rep_email ?? null,
        name: (r.rep_name && r.rep_name.trim()) || (r.rep_email ?? "Unnamed rep"),
        source: "commission_schedule",
        active: r.active ?? null,
      }));

      const byKey = new Map<string, RepOption>();
      for (const rep of fromProfiles) byKey.set(bestRepKey(rep), rep);

      for (const rep of fromComms) {
        const k = bestRepKey(rep);
        if (byKey.has(k)) {
          const existing = byKey.get(k)!;
          byKey.set(k, {
            ...existing,
            source: "merged",
            active: existing.active ?? rep.active ?? null,
          });
        } else {
          byKey.set(k, rep);
        }
      }

      const merged = Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
      if (!cancelled) {
        setReps(merged);
        setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { reps, loading, error };
}

/* ===================== Data: stripe (optional) ===================== */

function useStripeCustomer(stripeCustomerId?: string | null) {
  const [cust, setCust] = useState<StripeCustomerLite | null>(null);
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

    async function run() {
      try {
        const res = await fetch(`/api/stripe/customers?id=${encodeURIComponent(stripeCustomerId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const full = (await res.json()) as StripeCustomerLite;
        if (!cancelled) {
          setCust(full);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load Stripe customer");
          setLoading(false);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [stripeCustomerId]);

  return { customer: cust, loading, error };
}

/* ===================== RepSelect (inline) ===================== */

function RepSelect({
  value,
  onChange,
  disabled,
  placeholder = "Select a rep…",
}: {
  value?: string | null;
  onChange: (value: string | null, rep?: RepOption) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { reps, loading, error } = useRepsOptions();

  const options = useMemo(
    () =>
      reps.map((r) => ({
        key: bestRepKey(r),
        label: r.name + (r.email ? ` — ${r.email}` : ""),
        rep: r,
      })),
    [reps]
  );

  const currentKey = value ?? "";
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-neutral-700">Rep</label>
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
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/* ===================== Main Component ===================== */

export default function DealForm({ onDone, defaultRepKey, lockRep, stripeCustomerId }: Props) {
  const { customer: stripe, loading: stripeLoading, error: stripeError } = useStripeCustomer(stripeCustomerId);

  const [billingDifferent, setBillingDifferent] = useState(false);

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
    stripe_customer_id: stripeCustomerId ?? null,
  });

  const saveDisabled =
    !deal.stage ||
    !deal.account_rep ||
    !deal.value ||
    Number.isNaN(Number(deal.value)) ||
    Number(deal.value || 0) <= 0;

  const handleSave = useCallback(async () => {
    // Adjust to match your exact deals schema/column names.
    const payload = {
      name: deal.name,
      value: deal.value,
      stage: deal.stage,
      close_date: deal.close_date,
      account_rep: deal.account_rep,
      main_contact_name: deal.main_contact_name,
      main_contact_email: deal.main_contact_email,
      main_contact_phone: deal.main_contact_phone,
      billing_contact_name: billingDifferent ? deal.billing_contact_name : deal.main_contact_name,
      billing_contact_email: billingDifferent ? deal.billing_contact_email : deal.main_contact_email,
      billing_contact_phone: billingDifferent ? deal.billing_contact_phone : deal.main_contact_phone,
      stripe_customer_id: deal.stripe_customer_id ?? null,
    };

    const { error } = await supabase.from("deals").insert(payload);
    if (error) {
      alert(error.message);
      return;
    }
    onDone();
  }, [deal, billingDifferent, onDone]);

  // Quick helpers
  const shippingAddr = fmtAddr(stripe?.shipping?.address);
  const billingAddr = fmtAddr(stripe?.address);
  const anyAddr = shippingAddr || billingAddr;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Create Deal</h3>
        <div className="text-xs text-neutral-500">{stripeCustomerId ? `Stripe: ${stripeCustomerId}` : "No Stripe customer"}</div>
      </div>

      {/* Stripe address (read-only) */}
      <div className="rounded-xl border bg-neutral-50 p-4">
        <p className="text-xs font-semibold text-neutral-600 mb-1">Customer Address (read-only)</p>
        {stripeLoading && <p className="text-sm text-neutral-500">Loading Stripe details…</p>}
        {!stripeLoading && stripeError && <p className="text-sm text-red-600">Failed to load Stripe: {stripeError}</p>}
        {!stripeLoading && !stripeError && (
          <>
            {anyAddr ? (
              <div className="space-y-1 text-sm">
                {shippingAddr && (
                  <div>
                    <span className="font-medium">Shipping:</span> {shippingAddr}
                  </div>
                )}
                {billingAddr && (
                  <div>
                    <span className="font-medium">Billing:</span> {billingAddr}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No address on file.</p>
            )}
          </>
        )}
      </div>

      {/* Rep + Deal core fields */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          <RepSelect
            value={deal.account_rep}
            onChange={(key) => setDeal((d) => ({ ...d, account_rep: key }))}
            disabled={lockRep}
          />
        </div>

        <div className="md:col-span-1">
          <label className="mb-1 block text-sm font-medium text-neutral-700">Value (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={deal.value ?? ""}
            onChange={(e) => setDeal((d) => ({ ...d, value: e.target.value === "" ? null : Number(e.target.value) }))}
          />
        </div>

        <div className="md:col-span-1">
          <label className="mb-1 block text-sm font-medium text-neutral-700">Stage</label>
          <select
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={deal.stage ?? ""}
            onChange={(e) => setDeal((d) => ({ ...d, stage: (e.target.value as "open" | "paid") || null }))}
          >
            <option value="">Select stage…</option>
            <option value="open">Open</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <div className="md:col-span-1">
          <label className="mb-1 block text-sm font-medium text-neutral-700">Close date</label>
          <input
            type="date"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={deal.close_date ?? ""}
            onChange={(e) => setDeal((d) => ({ ...d, close_date: e.target.value || null }))}
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-neutral-700">Deal / Company name</label>
          <input
            type="text"
            placeholder="Acme District – 2025 renewal"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={deal.name ?? ""}
            onChange={(e) => setDeal((d) => ({ ...d, name: e.target.value || null }))}
          />
        </div>
      </div>

      {/* Main contact */}
      <div className="rounded-xl border p-4 space-y-3">
        <p className="text-sm font-semibold text-neutral-700">Main contact</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Name"
            value={deal.main_contact_name ?? ""}
            onChange={(e) => setDeal((d) => ({ ...d, main_contact_name: e.target.value || null }))}
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Email"
            type="email"
            value={deal.main_contact_email ?? ""}
            onChange={(e) => setDeal((d) => ({ ...d, main_contact_email: e.target.value || null }))}
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Phone"
            value={deal.main_contact_phone ?? ""}
            onChange={(e) => setDeal((d) => ({ ...d, main_contact_phone: e.target.value || null }))}
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
        <label htmlFor="billingDifferent" className="text-sm text-neutral-800">
          Billing contact is different
        </label>
      </div>

      {/* Billing contact (conditional) */}
      {billingDifferent && (
        <div className="rounded-xl border p-4 space-y-3">
          <p className="text-sm font-semibold text-neutral-700">Billing contact</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="Name"
              value={deal.billing_contact_name ?? ""}
              onChange={(e) => setDeal((d) => ({ ...d, billing_contact_name: e.target.value || null }))}
            />
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="Email"
              type="email"
              value={deal.billing_contact_email ?? ""}
              onChange={(e) => setDeal((d) => ({ ...d, billing_contact_email: e.target.value || null }))}
            />
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="Phone"
              value={deal.billing_contact_phone ?? ""}
              onChange={(e) => setDeal((d) => ({ ...d, billing_contact_phone: e.target.value || null }))}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          className="rounded-xl border px-4 py-2 text-sm"
          onClick={onDone}
        >
          Cancel
        </button>
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
