import { useMemo, useState, useEffect } from "react";
import Papa from "papaparse";
import FileDropzone from "../files/FileDropzone";
import { supabase } from "../../lib/supabaseClient";
import { Button } from "../ui";

/* ---------------- Types ---------------- */

type Props = {
  onDone: () => void;
  defaultRep?: string;   // header rep default
  lockRep?: boolean;     // lock the rep selector
};

type DealInsert = {
  name: string | null; // company (derived from Stripe; not shown as input)
  city: string | null; // derived; not input
  state: string | null; // derived; not input
  account_rep: string | null;
  value: number | null;
  stage: "paid" | "unpaid" | null;
  close_date: string | null;

  main_contact: string | null;
  main_contact_title: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;

  billing_contact_name: string | null;
  billing_contact_title: string | null;
  billing_contact_email: string | null;
  billing_contact_phone: string | null;

  invoice_number?: string | null;
  stripe_customer_id?: string | null;
};

type CsvRow = Record<string, string>;
type StripeCustomerLite = { id: string; name: string; email: string };

type StripeAddr = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
} | null;

type StripeCustomerFull = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: StripeAddr;
  shipping?: { name?: string | null; phone?: string | null; address?: StripeAddr } | null;
  billing_details?: { name?: string | null; email?: string | null; phone?: string | null; address?: StripeAddr } | null;
};

const HEADERS = {
  id: "id",
  amountDue: "Amount Due",
  total: "Total",
  paid: "Paid",
  dateUtc: "Date (UTC)",
  status: "Status",
  customer: "Customer",
  customerName: "Customer Name",
  customerEmail: "Customer Email",
  city: "Customer Address City",
  state: "Customer Address State",
  invoiceNumber: "Number",
  voidedAt: "Voided At (UTC)",
} as const;

/* ---------------- Utils ---------------- */

const toNumber = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const toDateYYYYMMDD = (v?: string): string | null => {
  if (!v) return null;
  const d = String(v).trim().split(" ")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

const truthy = (v?: string) => /^(true|1|yes)$/i.test(String(v ?? "").trim());

function preferAddress(c: StripeCustomerFull): StripeAddr {
  return c.shipping?.address ?? c.address ?? c.billing_details?.address ?? null;
}

function deriveFromStripe(c: StripeCustomerFull) {
  const mainName  = c.shipping?.name || c.name || "";
  const mainEmail = c.email || "";
  const mainPhone = c.shipping?.phone || c.phone || "";

  const bestAddr = preferAddress(c);
  const city  = bestAddr?.city ?? "";
  const state = bestAddr?.state ?? "";
  const postal = bestAddr?.postal_code ?? "";
  const line1 = bestAddr?.line1 ?? "";
  const line2 = bestAddr?.line2 ?? "";

  const b = c.billing_details;
  const billingName  = b?.name  || mainName;
  const billingEmail = b?.email || mainEmail;
  const billingPhone = b?.phone || mainPhone;

  return {
    companyName: c.name || mainName,
    addressLines: { line1, line2, city, state, postal },
    main:    { name: mainName,    email: mainEmail,    phone: mainPhone },
    billing: { name: billingName, email: billingEmail, phone: billingPhone },
  };
}

/* ---------------- Component ---------------- */

export default function AddDealExtendedForm({ onDone, defaultRep, lockRep }: Props) {
  const [mode, setMode] = useState<"manual" | "csv">("manual");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Stripe customer lookup
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOptions, setCustomerOptions] = useState<StripeCustomerLite[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<StripeCustomerLite | null>(null);
  const [, setSelectedCustomerFull] = useState<StripeCustomerFull | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerEmail, setNewCustomerEmail] = useState("");

  // Rep options
  const [repOptions, setRepOptions] = useState<string[]>([]);

  // Billing “is different”
  const [billingDifferent, setBillingDifferent] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "",
    city: "",
    state: "",
    account_rep: defaultRep ?? "",
    value: "",
    stage: "unpaid" as "paid" | "unpaid",
    close_date: "",

    main_contact: "",
    main_contact_title: "",
    main_contact_email: "",
    main_contact_phone: "",

    billing_contact_name: "",
    billing_contact_title: "",
    billing_contact_email: "",
    billing_contact_phone: "",
  });

  // Address display (read-only)
  const [addrDisplay, setAddrDisplay] = useState<{ line1?: string; line2?: string; city?: string; state?: string; postal?: string } | null>(null);

  // Derived flags (defined early to avoid TDZ issues)
  const readyForDealEntry = !!selectedCustomer;

  /* ----- API helpers ----- */

  async function createInvoiceForDeal(
    dealId: number,
    stripeCustomerId: string,
    amountUsd: number,
    description?: string
  ) {
    try {
      const res = await fetch("/api/invoices/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeCustomerId,
          amountUsd,
          description,
        }),
      });
      if (!res.ok) throw new Error(`Invoice API failed (${res.status})`);

      const inv: {
        id?: string;
        number?: string;
        hosted_invoice_url?: string;
        dashboard_url?: string;
      } = await res.json();

      // Persist invoice identifiers on the deal (columns should be nullable text)
      await supabase
        .from("deals")
        .update({
          invoice_number: inv.number ?? null,
          invoice_id: inv.id ?? null,                  // ensure column exists
          invoice_url: inv.hosted_invoice_url ?? null, // ensure column exists
        } as any)
        .eq("id", dealId);
    } catch (err) {
      console.error("Create invoice failed:", err);
      // optional: surface a toast; don’t block deal creation if invoice step fails
    }
  }

  /* ----- Effects ----- */

  useEffect(() => {
  if (defaultRep && defaultRep !== defaultRepCsv) {
    setDefaultRepCsv(defaultRep);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultRep]);

  // Load rep options: first try `reps` table, else distinct from deals
  useEffect(() => {
    (async () => {
      let reps: string[] = [];
      const { data: r1 } = await supabase.from("reps").select("name").order("name", { ascending: true });
      if (r1 && r1.length) {
        reps = r1.map((x: { name: string }) => x.name).filter(Boolean);
      } else {
        const { data: r2 } = await supabase
          .from("deals")
          .select("account_rep")
          .not("account_rep", "is", null)
          .order("account_rep", { ascending: true });
        if (r2 && r2.length) {
          const set = new Set<string>();
          for (const row of r2 as { account_rep: string | null }[]) if (row.account_rep) set.add(row.account_rep);
          reps = Array.from(set.values());
        }
      }
      setRepOptions(reps);
      if (defaultRep && !form.account_rep) {
        setForm((f) => ({ ...f, account_rep: defaultRep }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep form.account_rep synced to incoming header default if it changes
  useEffect(() => {
    if (defaultRep && form.account_rep !== defaultRep) {
      setForm((f) => ({ ...f, account_rep: defaultRep }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultRep]);

  // Search Stripe customers
  useEffect(() => {
    if (!customerQuery) {
      setCustomerOptions([]);
      return;
    }
    const t = setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const res = await fetch(`/api/stripe/customers?q=${encodeURIComponent(customerQuery)}`);
        const data: StripeCustomerLite[] = await res.json();
        setCustomerOptions(data);
      } finally {
        setCustomerLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [customerQuery]);

  /* ----- Handlers ----- */

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  async function handleSelectCustomer(opt: StripeCustomerLite) {
    try {
      const res = await fetch(`/api/stripe/customers?id=${opt.id}`);
      const full: StripeCustomerFull = await res.json();
      setSelectedCustomerFull(full);

      const d = deriveFromStripe(full);
      setAddrDisplay(d.addressLines);

      setForm((f) => ({
        ...f,
        name: d.companyName || f.name,
        city: d.addressLines.city || f.city,
        state: d.addressLines.state || f.state,
        account_rep: defaultRep ?? f.account_rep,
        stage: "unpaid",
        main_contact: d.main.name || f.main_contact,
        main_contact_title: f.main_contact_title,
        main_contact_email: d.main.email || f.main_contact_email,
        main_contact_phone: d.main.phone || f.main_contact_phone,
        billing_contact_name: d.billing.name || f.billing_contact_name,
        billing_contact_title: f.billing_contact_title,
        billing_contact_email: d.billing.email || f.billing_contact_email,
        billing_contact_phone: d.billing.phone || f.billing_contact_phone,
      }));
    } catch (e) {
      console.error("Failed to prefill from Stripe:", e);
    }
  }

  async function createStripeCustomer() {
    setCustomerLoading(true);
    try {
      const res = await fetch("/api/stripe/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || customerQuery || "New Customer",
          email: newCustomerEmail || undefined,
        }),
      });
      const c: StripeCustomerLite | { error?: string } = await res.json();
      if ((c as any).error) throw new Error((c as any).error);
      const cust = c as StripeCustomerLite;
      setSelectedCustomer(cust);
      setCustomerOptions([cust]);
      setCustomerQuery(`${cust.name}${cust.email ? ` (${cust.email})` : ""}`);
      setShowCreateCustomer(false);
      await handleSelectCustomer(cust);
    } catch (e: any) {
      alert(e.message || "Failed to create customer");
    } finally {
      setCustomerLoading(false);
    }
  }

  async function submitManual() {
    setBusy(true);
    setErr(null);

    const payload: DealInsert = {
      name: form.name || null,
      city: form.city || null,
      state: form.state || null,
      account_rep: form.account_rep || defaultRep || null,
      value: form.value ? Number(form.value) : null,
      stage: "unpaid",
      close_date: form.close_date || null,

      main_contact: form.main_contact || null,
      main_contact_title: null,
      main_contact_email: form.main_contact_email || null,
      main_contact_phone: form.main_contact_phone || null,

      billing_contact_name:  billingDifferent ? (form.billing_contact_name  || null) : null,
      billing_contact_title: null,
      billing_contact_email: billingDifferent ? (form.billing_contact_email || null) : null,
      billing_contact_phone: billingDifferent ? (form.billing_contact_phone || null) : null,

      stripe_customer_id: selectedCustomer?.id ?? null,
    };

    // 1) Create the deal
    const { data, error } = await supabase
      .from("deals")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }

    const dealId = data!.id;

    // 2) Create invoice (optional) then save identifiers
    try {
      if (selectedCustomer?.id && form.value && Number(form.value) > 0) {
        await createInvoiceForDeal(
          dealId,
          selectedCustomer.id,
          Number(form.value),
          form.name || undefined
        );
      }
    } finally {
      setBusy(false);
      onDone();
    }
  }

  /* ---------------- CSV Mode ---------------- */

  const [defaultRepCsv, setDefaultRepCsv] = useState(defaultRep ?? "");
  const [csvRows, setCsvRows] = useState<DealInsert[]>([]);
  const [parseErr, setParseErr] = useState<string | null>(null);

  const canImport = useMemo(() => {
  const hasFile = csvRows.length > 0;
  const hasRep = Boolean(defaultRepCsv || (lockRep && defaultRep));
  return hasFile && hasRep && !busy;
}, [csvRows.length, defaultRepCsv, lockRep, defaultRep, busy]);


  function parseCsvFile(file: File) {
    setParseErr(null);
    setCsvRows([]);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        if (res.errors?.length) {
          setParseErr(res.errors[0]?.message || "CSV parse error");
          return;
        }

        const filtered = (res.data as CsvRow[]).filter((r) => {
          const status = (r[HEADERS.status] ?? "").toLowerCase().trim();
          const isDraft = status.includes("draft");
          const isVoidedByStatus = status === "void" || status === "voided" || status.includes("void");
          const isVoidedByField = !!String(r[HEADERS.voidedAt] ?? "").trim();
          return !(isDraft || isVoidedByStatus || isVoidedByField);
        });

        const mapped: DealInsert[] = filtered.map((r) => {
          const paid = truthy(r[HEADERS.paid]);
          const name = r[HEADERS.customerName]?.trim() || r[HEADERS.customer]?.trim() || "";
          const value = toNumber(r[HEADERS.total]) ?? toNumber(r[HEADERS.amountDue]);
          return {
            invoice_number: r[HEADERS.invoiceNumber]?.trim() || null,
            name: name || null,
            city: r[HEADERS.city]?.trim() || null,
            state: r[HEADERS.state]?.trim() || null,
            account_rep: defaultRepCsv ? defaultRepCsv : null,
            value,
            stage: paid ? "paid" : "unpaid",
            close_date: toDateYYYYMMDD(r[HEADERS.dateUtc]),
            main_contact: null,
            main_contact_title: null,
            main_contact_email: r[HEADERS.customerEmail]?.trim() || null,
            main_contact_phone: null,
            billing_contact_name: null,
            billing_contact_title: null,
            billing_contact_email: null,
            billing_contact_phone: null,
            stripe_customer_id: null,
          };
        });

        const clean = mapped.filter((d) => (d.name && d.name !== "") || (d.value != null && d.value > 0));
        setCsvRows(clean);
      },
      error: (e) => setParseErr(e.message || "CSV parse error"),
    });
  }

  async function importCsv() {
    if (csvRows.length === 0) return;
    setBusy(true);
    setErr(null);
    const rows = csvRows.map((r) => ({
      ...r,
      account_rep: r.account_rep || (defaultRepCsv ? defaultRepCsv : null),
    }));
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const slice = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from("deals").insert(slice);
      if (error) {
        setBusy(false);
        setErr(`Import failed at row ${i + 1}: ${error.message}`);
        return;
      }
    }
    setBusy(false);
    onDone();
  }

  /* ---------------- Guards / Derived ---------------- */

  const canSaveManual = useMemo(() => {
    if (!readyForDealEntry) return false; // must pick a Stripe customer first
    const hasRep = Boolean(form.account_rep || defaultRep);     // allow header default when lockRep
    const hasValue = String(form.value).trim() !== "";          // change to Number(form.value) > 0 if desired
    const hasCloseDate = String(form.close_date).trim() !== "";
    return hasRep && hasValue && hasCloseDate && !busy;
  }, [readyForDealEntry, form.account_rep, form.value, form.close_date, defaultRep, busy]);

  /* ---------------- Render ---------------- */

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button variant={mode === "manual" ? "primary" : "secondary"} onClick={() => setMode("manual")}>Manual</Button>
        <Button variant={mode === "csv" ? "primary" : "secondary"} onClick={() => setMode("csv")}>CSV Upload</Button>
      </div>

      {mode === "manual" ? (
        <>
          {/* Stripe Customer */}
          <div>
            <div className="mb-2 font-medium text-sc-delft">Customer</div>
            <input
              className="mt-1 w-full border rounded px-2 py-1"
              placeholder="Search name or email…"
              value={customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value);
                setSelectedCustomer(null);
                setSelectedCustomerFull(null);
                setShowCreateCustomer(false);
                setAddrDisplay(null);
              }}
            />
            {customerLoading && <div className="text-xs text-gray-500 mt-1">Searching…</div>}

            {!customerLoading && customerQuery && customerOptions.length > 0 && (
              <ul className="border rounded mt-2 max-h-48 overflow-auto divide-y">
                {customerOptions.map((opt) => (
                  <li
                    key={opt.id}
                    className={`px-3 py-2 cursor-pointer hover:bg-gray-50 ${selectedCustomer?.id === opt.id ? "bg-gray-100" : ""}`}
                    onClick={async () => {
                      setSelectedCustomer(opt);
                      setCustomerQuery(`${opt.name || ""}${opt.email ? ` (${opt.email})` : ""}`);
                      await handleSelectCustomer(opt);
                    }}
                  >
                    <div className="text-sm font-medium">{opt.name || "(No name)"}</div>
                    <div className="text-xs text-gray-600">{opt.email}</div>
                    <div className="text-[10px] text-gray-400">{opt.id}</div>
                  </li>
                ))}
              </ul>
            )}

            {!customerLoading && customerQuery && customerOptions.length === 0 && !showCreateCustomer && (
              <button type="button" className="mt-2 text-sm underline" onClick={() => setShowCreateCustomer(true)}>
                Create new customer “{customerQuery}”
              </button>
            )}

            {showCreateCustomer && (
              <div className="mt-2 border rounded p-3 space-y-2">
                <div className="text-sm">Create Stripe customer as “{customerQuery || "New Customer"}”</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  placeholder="Account email"
                  type="email"
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button onClick={createStripeCustomer} disabled={customerLoading}>
                    {customerLoading ? "Creating…" : "Create"}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowCreateCustomer(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {selectedCustomer && (
              <div className="text-xs text-green-700 mt-2">
                Selected Stripe customer: {selectedCustomer.name || "(No name)"}{selectedCustomer.email ? ` • ${selectedCustomer.email}` : ""} ({selectedCustomer.id})
              </div>
            )}

            {/* Read-only address (from Stripe) */}
            {readyForDealEntry && addrDisplay && (
              <div className="mt-2 text-sm text-gray-800 space-y-0.5">
                {addrDisplay.line1 && <div>{addrDisplay.line1}</div>}
                {addrDisplay.line2 && <div>{addrDisplay.line2}</div>}
                {(addrDisplay.city || addrDisplay.state || addrDisplay.postal) && (
                  <div>
                    {addrDisplay.city ? `${addrDisplay.city}, ` : ""}
                    {addrDisplay.state || ""}
                    {addrDisplay.postal ? ` ${addrDisplay.postal}` : ""}
                  </div>
                )}
              </div>
            )}

            {/* Rep dropdown (under the green text & address) */}
            {readyForDealEntry && (
              <div className="mt-3">
                <label className="block font-medium text-sm text-gray-700">
                  Rep <span className="text-red-500">*</span>
                </label>
                <select
                  name="account_rep"
                  required={!lockRep} // if it's locked, we accept defaultRep via header
                  className={`mt-1 w-full border rounded px-2 py-1 ${lockRep ? "bg-gray-50" : ""}`}
                  value={form.account_rep}
                  onChange={handle}
                  disabled={!!lockRep}
                >
                  <option value="">Select a rep…</option>
                  {repOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Gate the rest until a customer is selected */}
          {readyForDealEntry && (
            <>
              {/* Deal (Value / Stage / Close Date) */}
              <div>
                <div className="mb-2 font-medium text-sc-delft">Deal</div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Value (USD) <span className="text-red-500">*</span>
                    <input
                      name="value"
                      type="number"
                      className="mt-1 w-full border rounded px-2 py-1"
                      required
                      value={form.value}
                      onChange={handle}
                    />
                  </label>
                  <label className="text-sm">Stage
                    <select name="stage" className="mt-1 w-full border rounded px-2 py-1 bg-gray-50" value="unpaid" disabled>
                      <option value="unpaid">Unpaid</option>
                    </select>
                  </label>
                  <label className="text-sm col-span-2">
                    Close Date <span className="text-red-500">*</span>
                    <input
                      name="close_date"
                      type="date"
                      className="mt-1 w-full border rounded px-2 py-1"
                      required
                      value={form.close_date}
                      onChange={handle}
                    />
                  </label>
                </div>
              </div>

              {/* Main Contact (editable) */}
              <div>
                <div className="mb-2 font-medium text-sc-delft">Main Contact</div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">Name
                    <input name="main_contact" className="mt-1 w-full border rounded px-2 py-1" value={form.main_contact} onChange={handle}/>
                  </label>
                  <label className="text-sm">Email
                    <input name="main_contact_email" type="email" className="mt-1 w-full border rounded px-2 py-1" value={form.main_contact_email} onChange={handle}/>
                  </label>
                  <label className="text-sm">Phone
                    <input name="main_contact_phone" className="mt-1 w-full border rounded px-2 py-1" value={form.main_contact_phone} onChange={handle}/>
                  </label>
                </div>
              </div>

              {/* Billing contact toggle + fields */}
              <div>
                <div className="mb-2 font-medium text-sc-delft">Billing Contact</div>
                <label className="flex items-center gap-2 text-sm mb-2">
                  <input
                    type="checkbox"
                    checked={billingDifferent}
                    onChange={(e) => setBillingDifferent(e.target.checked)}
                  />
                  Billing contact is different
                </label>

                {billingDifferent && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">Name
                      <input name="billing_contact_name" className="mt-1 w-full border rounded px-2 py-1"
                             value={form.billing_contact_name} onChange={handle}/>
                    </label>
                    <label className="text-sm">Email
                      <input name="billing_contact_email" type="email" className="mt-1 w-full border rounded px-2 py-1"
                             value={form.billing_contact_email} onChange={handle}/>
                    </label>
                    <label className="text-sm">Phone
                      <input name="billing_contact_phone" className="mt-1 w-full border rounded px-2 py-1"
                             value={form.billing_contact_phone} onChange={handle}/>
                    </label>
                  </div>
                )}
              </div>

              {err && <div className="text-sm text-red-600">{err}</div>}
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={submitManual}
                    disabled={!canSaveManual}
                    className={!canSaveManual ? "opacity-50 cursor-not-allowed" : ""}
                    title={!canSaveManual ? "Select a customer and fill Rep, Value, and Close Date" : ""}
                  >
                    {busy ? "Saving…" : "Save Deal"}
                  </Button>
                </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <FileDropzone
                accept=".csv,text/csv"
                onFile={(f) => parseCsvFile(f)}
                label="CSV file"
                help="Drag & drop or click to browse. Accepted: .csv (Stripe export)."
              />
            </div>
            <label className="text-sm col-span-2">
              Rep (applies to all imported rows) <span className="text-red-500">*</span>
              <select
                className={`mt-1 w-full border rounded px-2 py-1 ${lockRep ? "bg-gray-50" : ""}`}
                value={defaultRepCsv}
                onChange={(e) => setDefaultRepCsv(e.target.value)}
                required
                disabled={!!lockRep}
              >
                <option value="">
                  {lockRep ? "Rep locked by header" : "Select a rep…"}
                </option>
                {repOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <div className="text-xs text-gray-500 mt-1">
                This rep will be set on every imported deal.
              </div>
            </label>
          </div>

          {parseErr && <div className="text-sm text-red-600">{parseErr}</div>}

          {csvRows.length > 0 && (
            <div className="rounded border p-3">
              <div className="text-sm mb-2">
                Parsed <b>{csvRows.length}</b> row{csvRows.length === 1 ? "" : "s"}. Preview (first 5):
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-1 pr-2">Name</th>
                    <th className="py-1 pr-2">City</th>
                    <th className="py-1 pr-2">State</th>
                    <th className="py-1 pr-2">Stage</th>
                    <th className="py-1 pr-2">Value</th>
                    <th className="py-1 pr-2">Close Date</th>
                    <th className="py-1 pr-2">Email</th>
                    <th className="py-1 pr-2">Rep</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 pr-2">{r.name}</td>
                      <td className="py-1 pr-2">{r.city}</td>
                      <td className="py-1 pr-2">{r.state}</td>
                      <td className="py-1 pr-2">{r.stage}</td>
                      <td className="py-1 pr-2">{r.value ?? ""}</td>
                      <td className="py-1 pr-2">{r.close_date ?? ""}</td>
                      <td className="py-1 pr-2">{r.main_contact_email ?? ""}</td>
                      <td className="py-1 pr-2">{r.account_rep ?? defaultRepCsv}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {err && <div className="text-sm text-red-600">{err}</div>}
            <div className="flex justify-end gap-2">
              <Button
                onClick={importCsv}
                disabled={!canImport}
                className={!canImport ? "opacity-50 cursor-not-allowed" : ""}
                title={!canImport ? "Add a CSV file and select a Rep to continue" : ""}
              >
                {busy ? "Importing…" : `Import ${csvRows.length} Deal${csvRows.length === 1 ? "" : "s"}`}
              </Button>
            </div>
        </>
      )}
    </div>
  );
}
