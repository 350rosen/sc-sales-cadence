import { useCallback, useEffect, useState } from "react";
import RepSelect from "../reps/RepSelect";
import CustomerSearchSelect, { type StripeCustomerLite } from "../customers/CustomerSearchSelect";
import { supabase } from "../../lib/supabaseClient";

/* ---------------- Types ---------------- */
export type DealFormProps = {
  onDone?: () => void;                // ✅ now optional
  defaultRepKey?: string | null;
  lockRep?: boolean;
};

type DealInsert = {
  name: string | null;
  value: number | null;
  stage: "open" | "paid" | null;
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

/* ---------------- Helpers ---------------- */
const fmtAddr = (a?: StripeAddress | null) => {
  if (!a) return null;
  const parts = [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", "), a.postal_code, a.country].filter(Boolean);
  return parts.length ? parts.join(" • ") : null;
};

/* ---------------- Stripe hook ---------------- */
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
        const res = await fetch(`/api/stripe/customers?id=${encodeURIComponent(stripeCustomerId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const full = (await res.json()) as StripeCustomerFull;
        if (!cancelled) {
          setCust(full);
          setLoading(false);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load Stripe customer";
        if (!cancelled) {
          setError(msg);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [stripeCustomerId]);

  return { customer: cust, loading, error };
}

/* ---------------- Component ---------------- */
export default function DealForm({ onDone, defaultRepKey, lockRep }: DealFormProps) {
  const [billingDifferent, setBillingDifferent] = useState<boolean>(false);

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

  const { customer: stripe, loading: stripeLoading, error: stripeError } = useStripeCustomer(deal.stripe_customer_id ?? null);

  const saveDisabled =
    !deal.stage ||
    !deal.account_rep ||
    deal.value == null ||
    Number.isNaN(Number(deal.value)) ||
    Number(deal.value || 0) <= 0;

  const handleSave = useCallback(async () => {
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
    onDone?.();                // ✅ safe optional call
  }, [deal, billingDifferent, onDone]);

  const shippingAddr = fmtAddr(stripe?.shipping?.address);
  const billingAddr = fmtAddr(stripe?.address);
  const anyAddr = shippingAddr || billingAddr;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Add Deal</h3>
        <div className="text-xs text-neutral-500">
          {deal.stripe_customer_id ? `Stripe: ${deal.stripe_customer_id}` : "No Stripe customer"}
        </div>
      </div>

      {/* Customer selector using /api/stripe/customers */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          <CustomerSearchSelect
            value={deal.stripe_customer_id ?? null}
            onChange={(id: string | null, lite?: StripeCustomerLite | null) => {
              setDeal((d) => ({
                ...d,
                stripe_customer_id: id,
                name: d.name && d.name.trim().length > 0 ? d.name : (lite?.name || lite?.email || d.name),
              }));
            }}
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-neutral-700">Customer / Company name</label>
          <input
            type="text"
            placeholder="Acme District – 2025 renewal"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={deal.name ?? ""}
            onChange={(e) => setDeal((d) => ({ ...d, name: e.target.value || null }))}
          />
        </div>
      </div>

      {/* Address card */}
      <div className="rounded-xl border bg-neutral-50 p-4">
        <p className="mb-1 text-xs font-semibold text-neutral-600">Customer Address (read-only)</p>
        {stripeLoading && <p className="text-sm text-neutral-500">Loading Stripe details…</p>}
        {!stripeLoading && stripeError && <p className="text-sm text-red-600">Failed to load Stripe: {stripeError}</p>}
        {!stripeLoading && !stripeError && (
          <>
            {anyAddr ? (
              <div className="space-y-1 text-sm">
                {shippingAddr && <div><span className="font-medium">Shipping:</span> {shippingAddr}</div>}
                {billingAddr && <div><span className="font-medium">Billing:</span> {billingAddr}</div>}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No address on file.</p>
            )}
          </>
        )}
      </div>

      {/* Rep + core fields */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          <RepSelect
            value={deal.account_rep ?? ""}
            onChange={(key) => setDeal((d) => ({ ...d, account_rep: key }))}
            disabled={lockRep}
          />
        </div>

        <div className="md:col-span-1">
          <label className="mb-1 block text-sm font-medium text-neutral-700">Value (USD)</label>
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
                value: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
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
      </div>

      {/* Main contact */}
      <div className="space-y-3 rounded-xl border p-4">
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

      {/* Billing contact fields */}
      {billingDifferent && (
        <div className="space-y-3 rounded-xl border p-4">
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
        <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={() => onDone?.()}>
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
