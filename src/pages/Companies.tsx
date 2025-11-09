import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, Button } from "../components/ui";

type DealRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  stage: string | null;         // 'paid' | 'open' | etc.
  account_rep: string | null;
  close_date: string | null;
  value?: number | null;        // add if present in your schema
  stripe_customer_id?: string | null;
  invoice_id?: string | null;
};

type CompanyCard = {
  key: string;
  name: string;
  city: string;
  state: string;
  openDeals: number;
  closedDeals: number;
  rep: string;
  lastActivity: string | "none";
  stripeCustomerId?: string | null;
};

type StripeCustomer = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
  shipping?: {
    name?: string | null;
    phone?: string | null;
    address?: StripeCustomer["address"];
  } | null;
  invoice_settings?: {
    default_payment_method?: {
      id: string;
      card?: {
        brand?: string | null;
        last4?: string | null;
        exp_month?: number | null;
        exp_year?: number | null;
      } | null;
      type?: string | null;
    } | string | null;
  } | null;
  preferred_locales?: string[] | null;
  tax_exempt?: "none" | "exempt" | "reverse";
  tax_ids?: { data?: Array<{ id: string; type: string; value: string }> } | null;
  discount?: {
    coupon?: { id: string; name?: string | null; percent_off?: number | null; amount_off?: number | null; duration?: string | null } | null;
  } | null;
  cash_balance?: { settings?: { reconciliation_mode?: string | null } } | null;
  metadata?: Record<string, string>;
  // add fields you expand in your API route as needed
};

export default function Companies() {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [companies, setCompanies] = useState<CompanyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // selection + detail state
  const [selected, setSelected] = useState<CompanyCard | null>(null);
  const [stripeDetails, setStripeDetails] = useState<StripeCustomer | null>(null);
  const [loadingStripe, setLoadingStripe] = useState(false);

  // deals under selected company
  const [companyDeals, setCompanyDeals] = useState<DealRow[] | null>(null);
  const [loadingDeals, setLoadingDeals] = useState(false);

  // filters
  const [stageFilter, setStageFilter] = useState<"all" | "open" | "paid">("all");
  const [repFilter, setRepFilter] = useState<string>("all");
  const [minValue, setMinValue] = useState<string>(""); // strings for inputs
  const [maxValue, setMaxValue] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState<string>("");

  // -------- load base deals --------
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("id, name, city, state, stage, account_rep, close_date, value, stripe_customer_id")
        .returns<DealRow[]>();

      if (error) {
        setErr(error.message);
        setRows([]);
      } else {
        const normalized = (data ?? []).map((d) => ({
          ...d,
          stage: d.stage ? d.stage.toLowerCase() : null,
        }));
        setRows(normalized);
      }
      setLoading(false);
    })();
  }, []);

  // -------- aggregate companies --------
  useEffect(() => {
    const map = new Map<
      string,
      CompanyCard & { _repCounts: Record<string, number>, _stripeId?: string | null }
    >();

    for (const r of rows) {
      const name = r.name ?? "Unknown Company";
      const city = r.city ?? "—";
      const state = r.state ?? "—";
      const key = `${name}||${city}||${state}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          name,
          city,
          state,
          openDeals: 0,
          closedDeals: 0,
          rep: "Unassigned",
          lastActivity: "none",
          _repCounts: {},
          _stripeId: r.stripe_customer_id ?? null,
        });
      }

      const agg = map.get(key)!;
      if (r.stage === "paid") agg.closedDeals += 1;
      else agg.openDeals += 1;

      const rep = r.account_rep ?? "Unassigned";
      agg._repCounts[rep] = (agg._repCounts[rep] ?? 0) + 1;

      if (r.close_date) {
        const current = agg.lastActivity !== "none" ? new Date(agg.lastActivity) : null;
        const cd = new Date(r.close_date);
        if (!current || cd > current) agg.lastActivity = r.close_date;
      }

      // prefer a non-null stripe id if present anywhere
      if (r.stripe_customer_id) agg._stripeId = r.stripe_customer_id;
    }

    const out: CompanyCard[] = [];
    for (const c of map.values()) {
      let bestRep = "Unassigned";
      let bestCount = -1;
      for (const [rep, count] of Object.entries(c._repCounts)) {
        if (count > bestCount) {
          bestCount = count;
          bestRep = rep;
        }
      }
      out.push({
        key: c.key,
        name: c.name,
        city: c.city,
        state: c.state,
        openDeals: c.openDeals,
        closedDeals: c.closedDeals,
        rep: bestRep,
        lastActivity: c.lastActivity,
        stripeCustomerId: c._stripeId ?? null,
      });
    }

    out.sort((a, b) => b.openDeals - a.openDeals || a.name.localeCompare(b.name));
    setCompanies(out);
  }, [rows]);

  // -------- helpers: load stripe + deals for selected --------
  async function loadStripeDetails(c: CompanyCard) {
    if (!c.stripeCustomerId) return;
    setLoadingStripe(true);
    try {
      // Your API route should support expands (see snippet below)
      const res = await fetch(`/api/stripe/customers?id=${c.stripeCustomerId}&expand=tax_ids,invoice_settings.default_payment_method,discount,cash_balance,subscriptions`);
      const full = await res.json();
      setStripeDetails(full);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStripe(false);
    }
  }

  async function loadCompanyDeals(c: CompanyCard) {
    setLoadingDeals(true);
    try {
      // Prefer to join by stripe_customer_id when present, fallback to name
      let query = supabase.from("deals").select("id, name, city, state, stage, account_rep, close_date, value, stripe_customer_id").order("close_date", { ascending: false });

      if (c.stripeCustomerId) {
        query = query.eq("stripe_customer_id", c.stripeCustomerId);
      } else {
        query = query.eq("name", c.name);
      }

      const { data, error } = await query.returns<DealRow[]>();
      if (error) throw error;

      const normalized = (data ?? []).map((d) => ({
        ...d,
        stage: d.stage ? d.stage.toLowerCase() : null,
      }));
      setCompanyDeals(normalized);
    } catch (e) {
      console.error(e);
      setCompanyDeals([]);
    } finally {
      setLoadingDeals(false);
    }
  }

  function openDetails(c: CompanyCard) {
    setSelected(c);
    setStripeDetails(null);
    setCompanyDeals(null);
    // kick off both loads in parallel
    loadCompanyDeals(c);
    if (c.stripeCustomerId) loadStripeDetails(c);
  }

  const filteredDeals = useMemo(() => {
    if (!companyDeals) return [];
    let arr = companyDeals.slice();

    if (stageFilter !== "all") {
      arr = arr.filter(d => (stageFilter === "paid" ? d.stage === "paid" : d.stage !== "paid"));
    }
    if (repFilter !== "all") {
      arr = arr.filter(d => (d.account_rep ?? "Unassigned") === repFilter);
    }
    if (minValue) {
      const mv = parseFloat(minValue);
      if (!isNaN(mv)) arr = arr.filter(d => (d.value ?? 0) >= mv);
    }
    if (maxValue) {
      const xv = parseFloat(maxValue);
      if (!isNaN(xv)) arr = arr.filter(d => (d.value ?? 0) <= xv);
    }
    if (startDate) {
      const s = new Date(startDate);
      arr = arr.filter(d => !d.close_date || new Date(d.close_date) >= s);
    }
    if (endDate) {
      const e = new Date(endDate);
      arr = arr.filter(d => !d.close_date || new Date(d.close_date) <= e);
    }

    return arr;
  }, [companyDeals, stageFilter, repFilter, minValue, maxValue, startDate, endDate]);

  const repOptions = useMemo(() => {
    if (!companyDeals) return ["all"];
    const set = new Set<string>();
    for (const d of companyDeals) set.add(d.account_rep ?? "Unassigned");
    return ["all", ...Array.from(set).sort()];
  }, [companyDeals]);

  // ---------------------- DETAIL VIEW ----------------------
  if (selected) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Button onClick={() => { setSelected(null); setStripeDetails(null); }}>← Back</Button>
          <div className="text-lg font-semibold">{selected.name}</div>
          <div className="text-sm text-sc-delft/70">· {selected.city}, {selected.state}</div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Left: Stripe panel */}
          <Card className="p-6 space-y-3">
            <div className="text-base font-semibold">Customer Overview</div>
            <div className="text-sm">Customer ID: {selected.stripeCustomerId ?? "N/A"}</div>

            {!selected.stripeCustomerId ? (
              <div className="text-sm text-sc-delft/60">No customer linked.</div>
            ) : loadingStripe ? (
              <div className="text-sm text-sc-delft/60">Loading customer…</div>
            ) : stripeDetails ? (
              <div className="text-sm space-y-2">
                <div><strong>Name:</strong> {stripeDetails.name || "—"}</div>
                <div><strong>Email:</strong> {stripeDetails.email || "—"}</div>
                <div><strong>Phone:</strong> {stripeDetails.phone || "—"}</div>
                {stripeDetails.address && (
                  <div>
                    <strong>Billing Address:</strong>{" "}
                    {[stripeDetails.address.line1, stripeDetails.address.line2, stripeDetails.address.city, stripeDetails.address.state, stripeDetails.address.postal_code]
                      .filter(Boolean).join(", ") || "—"}
                  </div>
                )}
                {stripeDetails.invoice_settings?.default_payment_method && typeof stripeDetails.invoice_settings.default_payment_method === "object" && (
                  <div>
                    <strong>Default Payment Method:</strong>{" "}
                    {stripeDetails.invoice_settings.default_payment_method.card?.brand?.toUpperCase()} ••••{" "}
                    {stripeDetails.invoice_settings.default_payment_method.card?.last4}
                  </div>
                )}
                {stripeDetails.tax_exempt && <div><strong>Tax Exempt:</strong> {stripeDetails.tax_exempt}</div>}
                {stripeDetails.tax_ids?.data?.length ? (
                  <div>
                    <strong>Tax IDs:</strong>{" "}
                    {stripeDetails.tax_ids.data.map(t => `${t.type.toUpperCase()}:${t.value}`).join(" · ")}
                  </div>
                ) : null}
                {stripeDetails.discount?.coupon && (
                  <div>
                    <strong>Discount:</strong>{" "}
                    {stripeDetails.discount.coupon.name || stripeDetails.discount.coupon.id}{" "}
                    {stripeDetails.discount.coupon.percent_off != null
                      ? `(${stripeDetails.discount.coupon.percent_off}% off)`
                      : stripeDetails.discount.coupon.amount_off != null
                      ? `(amount off)`
                      : ""}
                  </div>
                )}
                {stripeDetails.preferred_locales?.length ? (
                  <div><strong>Locales:</strong> {stripeDetails.preferred_locales.join(", ")}</div>
                ) : null}
                {stripeDetails.metadata && Object.keys(stripeDetails.metadata).length > 0 && (
                  <div><strong>Metadata keys:</strong> {Object.keys(stripeDetails.metadata).join(", ")}</div>
                )}
              </div>
            ) : (
              <Button onClick={() => loadStripeDetails(selected!)}>Load Details</Button>
            )}
          </Card>

          {/* Right: quick stats */}
          <Card className="p-6 space-y-2">
            <div className="text-base font-semibold">Deal Overview</div>
            <div className="text-sm"><strong>Rep:</strong> {selected.rep}</div>
            <div className="text-sm">
              <strong>Last Activity:</strong>{" "}
              {selected.lastActivity === "none" ? "None" : new Date(selected.lastActivity).toLocaleDateString()}
            </div>
            <div className="text-sm"><strong>Open Deals:</strong> {selected.openDeals}</div>
            <div className="text-sm"><strong>Closed Deals:</strong> {selected.closedDeals}</div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="grid md:grid-cols-5 gap-3 items-end">
            {/* Stage */}
            <div className="flex flex-col">
              <label className="text-xs text-sc-delft/60 mb-1">Stage</label>
              <select
                className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm"
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as "all" | "open" | "paid")}
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            {/* Rep */}
            <div className="flex flex-col">
              <label className="text-xs text-sc-delft/60 mb-1">Rep</label>
              <select
                className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm"
                value={repFilter}
                onChange={(e) => setRepFilter(e.target.value)}
              >
                {repOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Min / Max Value */}
            <div className="flex flex-col">
              <label className="text-xs text-sc-delft/60 mb-1">Min Value</label>
              <input
                inputMode="numeric"
                className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm"
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-sc-delft/60 mb-1">Max Value</label>
              <input
                inputMode="numeric"
                className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm"
                value={maxValue}
                onChange={(e) => setMaxValue(e.target.value)}
                placeholder="100000"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col">
                <label className="text-xs text-sc-delft/60 mb-1">Start</label>
                <input
                  type="date"
                  className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-sc-delft/60 mb-1">End</label>
                <input
                  type="date"
                  className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Card>


        {/* Deals table */}
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-sc-delft/10">
            <div className="font-semibold">Deals ({companyDeals?.length ?? 0})</div>
          </div>

          {loadingDeals ? (
            <div className="p-4 text-sc-delft/60">Loading deals…</div>
          ) : !companyDeals || companyDeals.length === 0 ? (
            <div className="p-4 text-sc-delft/60">No deals yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-sc-delft/5 text-sc-delft/70">
                  <tr>
                    <th className="text-left px-4 py-2">ID</th>
                    <th className="text-left px-4 py-2">Invoice Number</th>
                    <th className="text-left px-4 py-2">Stage</th>
                    <th className="text-right px-4 py-2">Value</th>
                    <th className="text-left px-4 py-2">Rep</th>
                    <th className="text-left px-4 py-2">Close Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeals.map(d => (
                    <tr key={d.id} className="border-t border-sc-delft/10">
                      <td className="px-4 py-2 font-mono text-xs">{d.id}</td>
                      <td className="px-4 py-2 font-mono text-xs">{d.invoice_id}</td>
                      <td className="px-4 py-2">{d.stage ?? "—"}</td>
                      <td className="px-4 py-2 text-right">${d.value != null ? d.value.toLocaleString() : "—"}</td>
                      <td className="px-4 py-2">{d.account_rep ?? "Unassigned"}</td>
                      <td className="px-4 py-2">{d.close_date ? new Date(d.close_date).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    );
  }

  // ---------------------- LIST VIEW ----------------------
  return (
    <section className="space-y-4">
      {!loading && (
        <div className="text-xs text-sc-delft/60">
          {err ? `Error: ${err}` : `companies: ${companies.length}`}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <Card className="p-4 text-sc-delft/60">Loading…</Card>
        ) : companies.length === 0 ? (
          <Card className="p-4 text-sc-delft/60">No companies yet</Card>
        ) : (
          companies.map((c) => (
            <Card key={c.key} className="p-4">
              <div className="font-semibold text-sc-delft">{c.name}</div>
              <div className="text-sm text-sc-delft/70">
                {c.city}, {c.state}
              </div>

              {c.stripeCustomerId && (
                <div className="text-xs text-sc-delft/60 mt-1">ID: {c.stripeCustomerId}</div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between rounded-md border border-sc-delft/15 px-3 py-2">
                  <span className="text-sm text-sc-delft/80">Open</span>
                  <span className="inline-flex items-center justify-center h-6 min-w-6 rounded-full bg-sc-orange/20 text-sc-orange text-xs px-2">
                    {c.openDeals}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-sc-delft/15 px-3 py-2">
                  <span className="text-sm text-sc-delft/80">Paid</span>
                  <span className="inline-flex items-center justify-center h-6 min-w-6 rounded-full bg-sc-lightgreen/20 text-sc-green text-xs px-2">
                    {c.closedDeals}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-sc-delft/70">Rep</span>
                <span className="font-medium text-sc-delft">{c.rep}</span>
              </div>

              <div className="mt-1 text-xs text-sc-delft/60">
                Last activity:{" "}
                {c.lastActivity === "none" ? "None" : new Date(c.lastActivity).toLocaleDateString()}
              </div>

              <div className="mt-4">
                <Button className="w-full" onClick={() => openDetails(c)}>
                  View Details
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
