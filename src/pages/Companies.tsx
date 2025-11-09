import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, Button } from "../components/ui";
import Modal from "../components/forms/Modal";
import CreateCustomerForm from "../components/forms/CreateCustomerForm";

type DealRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  stage: string | null;
  account_rep: string | null;
  close_date: string | null;
  value?: number | null;
  stripe_customer_id?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
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

type StripeCustomerLite = { id: string; name?: string; email?: string | null };
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
      card?: { brand?: string | null; last4?: string | null; exp_month?: number | null; exp_year?: number | null } | null;
      type?: string | null;
    } | string | null;
  } | null;
  preferred_locales?: string[] | null;
  tax_exempt?: "none" | "exempt" | "reverse";
  tax_ids?: { data?: Array<{ id: string; type: string; value: string }> } | null;
  discount?: { coupon?: { id: string; name?: string | null; percent_off?: number | null; amount_off?: number | null; duration?: string | null } | null } | null;
  cash_balance?: { settings?: { reconciliation_mode?: string | null } } | null;
  metadata?: Record<string, string>;
};

const inputStyle =
  "mt-1 w-full border border-sc-delft/25 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sc-green/40 focus:border-sc-green/60";
const labelStyle = "text-sm font-medium text-sc-delft";

export default function Companies() {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [companies, setCompanies] = useState<CompanyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // selection + detail state
  const [selected, setSelected] = useState<CompanyCard | null>(null);
  const [stripeDetails, setStripeDetails] = useState<StripeCustomer | null>(null);
  const [loadingStripe, setLoadingStripe] = useState(false);
  const [stripeErr, setStripeErr] = useState<string | null>(null);

  // deals under selected company
  const [companyDeals, setCompanyDeals] = useState<DealRow[] | null>(null);
  const [loadingDeals, setLoadingDeals] = useState(false);

  // detail view filters (deals)
  const [stageFilter, setStageFilter] = useState<"all" | "open" | "paid">("all");
  const [repFilter, setRepFilter] = useState<string>("all");
  const [minValue, setMinValue] = useState<string>("");
  const [maxValue, setMaxValue] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // list view filters (companies)
  const [companySearch, setCompanySearch] = useState("");
  const [repFilterList, setRepFilterList] = useState<string>("all");
  const [stateFilterList, setStateFilterList] = useState<string>("all");

  // --- New: Stripe search + modal
  const [openCreateCustomer, setOpenCreateCustomer] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerBusy, setCustomerBusy] = useState(false);
  const [customerErr, setCustomerErr] = useState<string | null>(null);
  const [customerHits, setCustomerHits] = useState<StripeCustomerLite[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);

  // -------- load base deals --------
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("deals")
        .select(
          "id, name, city, state, stage, account_rep, close_date, value, stripe_customer_id, invoice_id, invoice_number"
        )
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
    const map = new Map<string, CompanyCard & { _repCounts: Record<string, number>; _stripeId?: string | null }>();

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

  // -------- list view filter options & filtering --------
  const repOptionsList = useMemo(() => {
    const s = new Set<string>();
    for (const c of companies) s.add(c.rep || "Unassigned");
    return ["all", ...Array.from(s).sort()];
  }, [companies]);

  const stateOptionsList = useMemo(() => {
    const s = new Set<string>();
    for (const c of companies) s.add(c.state || "—");
    const items = Array.from(s).filter((v) => v !== "—").sort();
    if (s.has("—")) items.push("—");
    return ["all", ...items];
  }, [companies]);

  const visibleCompanies = useMemo(() => {
    let arr = companies.slice();

    if (repFilterList !== "all") {
      arr = arr.filter((c) => (c.rep || "Unassigned") === repFilterList);
    }
    if (stateFilterList !== "all") {
      arr = arr.filter((c) => (c.state || "—") === stateFilterList);
    }
    if (companySearch.trim()) {
      const q = companySearch.trim().toLowerCase();
      arr = arr.filter((c) => c.name.toLowerCase().includes(q));
    }
    return arr;
  }, [companies, repFilterList, stateFilterList, companySearch]);

  function resetCompanyFilters() {
    setCompanySearch("");
    setRepFilterList("all");
    setStateFilterList("all");
  }

  // -------- helpers --------
  async function loadStripeDetails(c: CompanyCard) {
    if (!c.stripeCustomerId) return;
    setStripeErr(null);
    setLoadingStripe(true);
    try {
      const id = encodeURIComponent(c.stripeCustomerId);
      const res = await fetch(
        `/api/stripe/customers?id=${id}&expand=invoice_settings.default_payment_method,tax_ids,discount`
      );
      const body = await res.json();

      if (!res.ok) {
        const msg = body?.error || `HTTP ${res.status}`;
        setStripeErr(msg);
        setStripeDetails(null);
        return;
      }
      if (!body || !body.id) {
        setStripeErr("No customer found for that ID.");
        setStripeDetails(null);
        return;
      }
      setStripeDetails(body);
    } catch (e: any) {
      setStripeErr(e?.message || "Failed to load Stripe details");
      setStripeDetails(null);
    } finally {
      setLoadingStripe(false);
    }
  }

  async function attachInvoiceNumbers(deals: DealRow[]): Promise<DealRow[]> {
    const needs = deals.filter((d) => !d.invoice_number && d.invoice_id).map((d) => d.invoice_id!);
    const ids = Array.from(new Set(needs));
    if (!ids.length) return deals;

    const pairs = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(`/api/stripe/invoice?id=${id}`);
          const inv = await r.json();
          return [id, inv?.number ?? null] as const;
        } catch {
          return [id, null] as const;
        }
      })
    );

    const map = new Map<string, string | null>(pairs);
    return deals.map((d) =>
      d.invoice_number ? d : { ...d, invoice_number: d.invoice_id ? map.get(d.invoice_id) ?? null : null }
    );
  }

  async function loadCompanyDeals(c: CompanyCard) {
    setLoadingDeals(true);
    try {
      let query = supabase
        .from("deals")
        .select(
          "id, name, city, state, stage, account_rep, close_date, value, stripe_customer_id, invoice_id, invoice_number"
        )
        .order("close_date", { ascending: false });

      if (c.stripeCustomerId) query = query.eq("stripe_customer_id", c.stripeCustomerId);
      else query = query.eq("name", c.name);

      const { data, error } = await query.returns<DealRow[]>();
      if (error) throw error;

      const normalized = (data ?? []).map((d) => ({
        ...d,
        stage: d.stage ? d.stage.toLowerCase() : null,
      }));

      const withNumbers = await attachInvoiceNumbers(normalized);
      setCompanyDeals(withNumbers);
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
    loadCompanyDeals(c);
    if (c.stripeCustomerId) loadStripeDetails(c);
    // prefill search box with current company name for convenience
    setCustomerQuery(c.name);
    void searchStripeCustomers(c.name);
  }

  // --- New: search / link stripe customers
  async function searchStripeCustomers(q: string) {
    setCustomerBusy(true);
    setCustomerErr(null);
    try {
      const url = q ? `/api/stripe/customers?q=${encodeURIComponent(q)}` : `/api/stripe/customers`;
      const res = await fetch(url);
      const data: StripeCustomerLite[] = await res.json();
      if (!res.ok) throw new Error((data as any)?.error || "Search failed");
      setCustomerHits(data || []);
    } catch (e: any) {
      setCustomerErr(e?.message || "Failed to search customers");
      setCustomerHits([]);
    } finally {
      setCustomerBusy(false);
    }
  }

  async function linkCompanyToStripe(stripeCustomerId: string) {
    if (!selected) return;
    setLinkBusy(true);
    setLinkErr(null);
    try {
      // Update any deals for this company that lack a stripe_customer_id
      const { error } = await supabase
        .from("deals")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("name", selected.name)
        .is("stripe_customer_id", null);

      if (error) throw error;

      // Update local selected, reload panels
      const updated: CompanyCard = { ...selected, stripeCustomerId };
      setSelected(updated);
      await loadCompanyDeals(updated);
      await loadStripeDetails(updated);
    } catch (e: any) {
      setLinkErr(e?.message || "Failed to link company");
    } finally {
      setLinkBusy(false);
    }
  }

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
            ) : stripeErr ? (
              <div className="text-sm text-red-600">
                {stripeErr}
                <div className="mt-2">
                  <Button onClick={() => loadStripeDetails(selected!)}>Retry</Button>
                </div>
              </div>
            ) : stripeDetails ? (
              <div className="text-sm space-y-2">
                <div><strong>Name:</strong> {stripeDetails.name || "—"}</div>
                <div><strong>Email:</strong> {stripeDetails.email || "—"}</div>
                <div><strong>Phone:</strong> {stripeDetails.phone || "—"}</div>
                {stripeDetails.address && (
                  <div>
                    <strong>Billing Address:</strong>{" "}
                    {[
                      stripeDetails.address.line1,
                      stripeDetails.address.line2,
                      stripeDetails.address.city,
                      stripeDetails.address.state,
                      stripeDetails.address.postal_code,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </div>
                )}
                {stripeDetails.invoice_settings?.default_payment_method &&
                  typeof stripeDetails.invoice_settings.default_payment_method === "object" && (
                    <div>
                      <strong>Default Payment Method:</strong>{" "}
                      {stripeDetails.invoice_settings.default_payment_method.card?.brand?.toUpperCase()} ••••{" "}
                      {stripeDetails.invoice_settings.default_payment_method.card?.last4}
                    </div>
                  )}
              </div>
            ) : (
              <Button onClick={() => loadStripeDetails(selected!)}>Load Details</Button>
            )}
          </Card>

          {/* Right: Link / Search Stripe customer */}
          <Card className="p-6 space-y-4">
            <div className="text-base font-semibold">Link to Stripe Customer</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <label className={`${labelStyle} md:col-span-2`}>
                Search Customers
                <input
                  className={inputStyle}
                  value={customerQuery}
                  onChange={(e) => {
                    const q = e.target.value;
                    setCustomerQuery(q);
                    void searchStripeCustomers(q);
                  }}
                  placeholder="Type name or email…"
                />
              </label>

              <Button
                variant="secondary"
                onClick={() => setOpenCreateCustomer(true)}
              >
                + New Customer
              </Button>
            </div>

            {customerErr && <div className="text-sm text-red-600">{customerErr}</div>}

            <div className="border border-sc-delft/15 rounded-md">
              <div className="px-3 py-2 border-b border-sc-delft/10 text-sm text-sc-delft/70">
                Results {customerBusy ? "— searching…" : `(${customerHits.length})`}
              </div>
              <div className="max-h-64 overflow-auto divide-y divide-sc-delft/10">
                {customerHits.map((c) => (
                  <div key={c.id} className="px-3 py-2 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium text-sc-delft">{c.name || "—"}</div>
                      <div className="text-sc-delft/70">{c.email || "—"}</div>
                    </div>
                    <Button
                      disabled={linkBusy}
                      onClick={() => linkCompanyToStripe(c.id)}
                    >
                      {linkBusy ? "Linking…" : "Link"}
                    </Button>
                  </div>
                ))}
                {!customerBusy && customerHits.length === 0 && (
                  <div className="px-3 py-4 text-sm text-sc-delft/60">No customers yet. Try another search or create a new one.</div>
                )}
              </div>
              {linkErr && <div className="px-3 py-2 text-sm text-red-600">{linkErr}</div>}
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="grid md:grid-cols-5 gap-3 items-end">
            <div className="flex flex-col">
              <label className="text-xs text-sc-delft/60 mb-1">Stage</label>
              <select className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm" value={stageFilter} onChange={(e) => setStageFilter(e.target.value as "all" | "open" | "paid")}>
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-sc-delft/60 mb-1">Rep</label>
              <select className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm" value={repFilter} onChange={(e) => setRepFilter(e.target.value)}>
                {(["all", ...(companyDeals ? Array.from(new Set(companyDeals.map(d => d.account_rep ?? "Unassigned"))).sort() : [])] as string[]).map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-sc-delft/60 mb-1">Min Value</label>
              <input inputMode="numeric" className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm" value={minValue} onChange={(e) => setMinValue(e.target.value)} placeholder="0" />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-sc-delft/60 mb-1">Max Value</label>
              <input inputMode="numeric" className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} placeholder="100000" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col">
                <label className="text-xs text-sc-delft/60 mb-1">Start</label>
                <input type="date" className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-sc-delft/60 mb-1">End</label>
                <input type="date" className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
                  {companyDeals
                    .filter((d) => {
                      let ok = true;
                      if (stageFilter !== "all") ok = ok && (stageFilter === "paid" ? d.stage === "paid" : d.stage !== "paid");
                      if (repFilter !== "all") ok = ok && ((d.account_rep ?? "Unassigned") === repFilter);
                      if (minValue) ok = ok && ((d.value ?? 0) >= (parseFloat(minValue) || 0));
                      if (maxValue) ok = ok && ((d.value ?? 0) <= (parseFloat(maxValue) || Infinity));
                      if (startDate) ok = ok && (!d.close_date || new Date(d.close_date) >= new Date(startDate));
                      if (endDate) ok = ok && (!d.close_date || new Date(d.close_date) <= new Date(endDate));
                      return ok;
                    })
                    .map((d) => (
                      <tr key={d.id} className="border-t border-sc-delft/10">
                        <td className="px-4 py-2 font-mono text-xs">{d.id}</td>
                        <td className="px-4 py-2 font-mono text-xs">{d.invoice_number ?? "—"}</td>
                        <td className="px-4 py-2 text-center">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                              (d.stage ?? "").toLowerCase() === "paid"
                                ? "bg-sc-lightgreen/20 text-sc-green"
                                : "bg-sc-orange/20 text-sc-orange"
                            }`}
                          >
                            {d.stage ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {d.value != null ? `$${d.value.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-2">{d.account_rep ?? "Unassigned"}</td>
                        <td className="px-4 py-2">{d.close_date ? new Date(d.close_date).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Create Customer Modal */}
        <Modal open={openCreateCustomer} title="Create Customer" onClose={() => setOpenCreateCustomer(false)}>
          <CreateCustomerForm
            onDone={async () => {
              setOpenCreateCustomer(false);
              // Refresh search list with current query so the new customer appears
              await searchStripeCustomers(customerQuery || selected.name);
            }}
          />
        </Modal>
      </section>
    );
  }

  // ---------------------- LIST VIEW ----------------------
  return (
    <section className="space-y-4">
      {!loading && (
        <div className="text-xs text-sc-delft/60">
          {err ? `Error: ${err}` : `companies: ${visibleCompanies.length} / ${companies.length}`}
        </div>
      )}

      {/* Toolbar: Rep + State + Search + Reset */}
      <Card className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Rep */}
          <div className="text-sm text-sc-delft/70">Rep</div>
          <select
            className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm"
            value={repFilterList}
            onChange={(e) => setRepFilterList(e.target.value)}
          >
            {repOptionsList.map((r) => (
              <option key={r} value={r}>
                {r === "all" ? "All" : r}
              </option>
            ))}
          </select>

          {/* State */}
          <div className="text-sm text-sc-delft/70">State</div>
          <select
            className="border border-sc-delft/15 rounded-md px-2 py-1 text-sm"
            value={stateFilterList}
            onChange={(e) => setStateFilterList(e.target.value)}
          >
            {stateOptionsList.map((st) => (
              <option key={st} value={st}>
                {st === "all" ? "All" : st}
              </option>
            ))}
          </select>

          {/* Search */}
          <input
            id="companies-search"
            className="border border-sc-delft/15 rounded-md px-3 py-1 text-sm min-w-[260px] flex-1"
            placeholder="Search company name…"
            value={companySearch}
            onChange={(e) => setCompanySearch(e.target.value)}
          />

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={resetCompanyFilters}>
              Reset
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <Card className="p-4 text-sc-delft/60">Loading…</Card>
        ) : visibleCompanies.length === 0 ? (
          <Card className="p-4 text-sc-delft/60">No companies yet</Card>
        ) : (
          visibleCompanies.map((c) => (
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
                Last activity: {c.lastActivity === "none" ? "None" : new Date(c.lastActivity).toLocaleDateString()}
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
