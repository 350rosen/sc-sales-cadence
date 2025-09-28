// src/components/deals/AddDealExtendedForm.tsx
import { useMemo, useState } from "react";
import Papa from "papaparse";
import FileDropzone from "../files/FileDropzone";
import { supabase } from "../../lib/supabaseClient";
import { Button } from "../ui";

type Props = { onDone: () => void };

type DealInsert = {
  name: string | null;
  city: string | null;
  state: string | null;
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
};

type CsvRow = Record<string, string>;

const HEADERS = {
  id: "id",
  amountDue: "Amount Due",
  total: "Total",
  paid: "Paid",
  dateUtc: "Date (UTC)",
  status: "Status",                  // already existed — keep only once
  customer: "Customer",
  customerName: "Customer Name",
  customerEmail: "Customer Email",
  city: "Customer Address City",
  state: "Customer Address State",
  invoiceNumber: "Number",           // NEW
  voidedAt: "Voided At (UTC)",       // NEW
} as const;


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

export default function AddDealExtendedForm({ onDone }: Props) {
  const [mode, setMode] = useState<"manual" | "csv">("csv"); // default to CSV per your request
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ---------- Manual form (unchanged from your version, small tightening) ----------
  const [form, setForm] = useState({
    name: "",
    city: "",
    state: "",
    account_rep: "",
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

  const handle = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  async function submitManual() {
    setBusy(true);
    setErr(null);

    const payload: DealInsert = {
      name: form.name || null,
      city: form.city || null,
      state: form.state || null,
      account_rep: form.account_rep || null,
      value: form.value ? Number(form.value) : null,
      stage: form.stage || null,
      close_date: form.close_date || null,

      main_contact: form.main_contact || null,
      main_contact_title: form.main_contact_title || null,
      main_contact_email: form.main_contact_email || null,
      main_contact_phone: form.main_contact_phone || null,

      billing_contact_name: form.billing_contact_name || null,
      billing_contact_title: form.billing_contact_title || null,
      billing_contact_email: form.billing_contact_email || null,
      billing_contact_phone: form.billing_contact_phone || null,
    };

    const { error } = await supabase.from("deals").insert(payload);
    setBusy(false);
    if (error) setErr(error.message);
    else onDone();
  }

  // ---------- CSV mode ----------
  const [defaultRep, setDefaultRep] = useState(""); // applied to all uploaded rows
  const [csvRows, setCsvRows] = useState<DealInsert[]>([]);
  const [parseErr, setParseErr] = useState<string | null>(null);

  const canImport = useMemo(() => csvRows.length > 0 && !busy, [csvRows, busy]);

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

      // ignore Drafts & Voids
      const filtered = (res.data as CsvRow[]).filter((r) => {
        const status = (r[HEADERS.status] ?? "").toLowerCase().trim();
        const isDraft = status.includes("draft");
        const isVoidedByStatus = status === "void" || status === "voided" || status.includes("void");
        const isVoidedByField = !!String(r[HEADERS.voidedAt] ?? "").trim();
        return !(isDraft || isVoidedByStatus || isVoidedByField);
      });

      const mapped: DealInsert[] = filtered.map((r) => {
        const paid = truthy(r[HEADERS.paid]);
        const name =
          r[HEADERS.customerName]?.trim() ||
          r[HEADERS.customer]?.trim() ||
          "";
        const value = toNumber(r[HEADERS.total]) ?? toNumber(r[HEADERS.amountDue]);

        return {
          // store invoice number (use this for display as “ID”)
          invoice_number: r[HEADERS.invoiceNumber]?.trim() || null,

          name: name || null,
          city: r[HEADERS.city]?.trim() || null,
          state: r[HEADERS.state]?.trim() || null,
          account_rep: defaultRep ? defaultRep : null,
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
        };
      });

      const clean = mapped.filter(
        (d) => (d.name && d.name !== "") || (d.value != null && d.value > 0)
      );
      setCsvRows(clean);
    },
    error: (e) => setParseErr(e.message || "CSV parse error"),
  });
}

  async function importCsv() {
    if (csvRows.length === 0) return;
    setBusy(true);
    setErr(null);

    // apply default rep before insert
    const rows = csvRows.map((r) => ({
      ...r,
      account_rep: r.account_rep || (defaultRep ? defaultRep : null),
    }));

    // Chunk to avoid payload limits
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

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button variant={mode === "manual" ? "primary" : "secondary"} onClick={() => setMode("manual")}>
          Manual
        </Button>
        <Button variant={mode === "csv" ? "primary" : "secondary"} onClick={() => setMode("csv")}>
          CSV Upload
        </Button>
      </div>

      {mode === "manual" ? (
        <>
          {/* Deal basics */}
          <div>
            <div className="mb-2 font-medium text-sc-delft">Deal</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Company
                <input name="name" className="mt-1 w-full border rounded px-2 py-1" value={form.name} onChange={handle}/>
              </label>
              <label className="text-sm">Rep
                <input name="account_rep" className="mt-1 w-full border rounded px-2 py-1" value={form.account_rep} onChange={handle}/>
              </label>
              <label className="text-sm">City
                <input name="city" className="mt-1 w-full border rounded px-2 py-1" value={form.city} onChange={handle}/>
              </label>
              <label className="text-sm">State
                <input name="state" className="mt-1 w-full border rounded px-2 py-1" value={form.state} onChange={handle}/>
              </label>
              <label className="text-sm">Value (USD)
                <input name="value" type="number" min="0" className="mt-1 w-full border rounded px-2 py-1" value={form.value} onChange={handle}/>
              </label>
              <label className="text-sm">Stage
                <select name="stage" className="mt-1 w-full border rounded px-2 py-1" value={form.stage} onChange={handle}>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
              <label className="text-sm col-span-2">Close Date
                <input name="close_date" type="date" className="mt-1 w-full border rounded px-2 py-1" value={form.close_date} onChange={handle}/>
              </label>
            </div>
          </div>

          {/* Main contact */}
          <div>
            <div className="mb-2 font-medium text-sc-delft">Main Contact</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Name
                <input name="main_contact" className="mt-1 w-full border rounded px-2 py-1" value={form.main_contact} onChange={handle}/>
              </label>
              <label className="text-sm">Title
                <input name="main_contact_title" className="mt-1 w-full border rounded px-2 py-1" value={form.main_contact_title} onChange={handle}/>
              </label>
              <label className="text-sm">Email
                <input name="main_contact_email" type="email" className="mt-1 w-full border rounded px-2 py-1" value={form.main_contact_email} onChange={handle}/>
              </label>
              <label className="text-sm">Phone
                <input name="main_contact_phone" className="mt-1 w-full border rounded px-2 py-1" value={form.main_contact_phone} onChange={handle}/>
              </label>
            </div>
          </div>

          {/* Billing contact */}
          <div>
            <div className="mb-2 font-medium text-sc-delft">Billing Contact</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Name
                <input name="billing_contact_name" className="mt-1 w-full border rounded px-2 py-1" value={form.billing_contact_name} onChange={handle}/>
              </label>
              <label className="text-sm">Title
                <input name="billing_contact_title" className="mt-1 w-full border rounded px-2 py-1" value={form.billing_contact_title} onChange={handle}/>
              </label>
              <label className="text-sm">Email
                <input name="billing_contact_email" type="email" className="mt-1 w-full border rounded px-2 py-1" value={form.billing_contact_email} onChange={handle}/>
              </label>
              <label className="text-sm">Phone
                <input name="billing_contact_phone" className="mt-1 w-full border rounded px-2 py-1" value={form.billing_contact_phone} onChange={handle}/>
              </label>
            </div>
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onDone}>Cancel</Button>
            <Button onClick={submitManual} disabled={busy}>{busy ? "Saving…" : "Save Deal"}</Button>
          </div>
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
              Apply this Rep to all rows (optional)
              <input
                className="mt-1 w-full border rounded px-2 py-1"
                value={defaultRep}
                onChange={(e) => setDefaultRep(e.target.value)}
                placeholder="e.g., Daniel Goldfinger"
              />
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
                      <td className="py-1 pr-2">{r.account_rep ?? defaultRep}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {err && <div className="text-sm text-red-600">{err}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onDone}>Cancel</Button>
            <Button onClick={importCsv} disabled={!canImport}>
              {busy ? "Importing…" : `Import ${csvRows.length} Deal${csvRows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
