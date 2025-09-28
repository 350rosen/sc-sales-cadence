import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Button, Card } from "../components/ui";
import Modal from "../components/forms/Modal";
import DealForm from "../components/forms/DealForm";

/* ---------- Types ---------- */

type DealRow = {
  id: number;
  invoice_number?: string | null; // ← add this
  name: string | null;
  city: string | null;
  state: string | null;
  stage: string | null;
  account_rep: string | null;
  value: string | number | null;
  close_date: string | null;
};

type StageFilter = "all" | "paid" | "unpaid";

/* ---------- Page ---------- */

export default function Deals() {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filters
  const [stage, setStage] = useState<StageFilter>("all");
  const [rep, setRep] = useState<string>("all");
  const [companyQuery, setCompanyQuery] = useState<string>("");

  // Modals + reload
  const [openAdd, setOpenAdd] = useState(false);
  const [editDeal, setEditDeal] = useState<DealRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  /* ---------- Data load ---------- */

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
          .from("deals")
          .select("id, invoice_number, name, city, state, stage, account_rep, value, close_date, created_at")
          .order("created_at", { ascending: false })
          .returns<DealRow[]>();

      if (error) {
        console.error(error);
        setErr(error.message);
        setRows([]);
      } else {
        const normalized = (data ?? []).map((d) => ({
          ...d,
          stage: d.stage ? d.stage.toLowerCase() : null,
        }));
        setRows(normalized);
        setErr(null);
      }
      setLoading(false);
    })();
  }, [reloadKey]);

  /* ---------- Derived ---------- */

  const reps = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.account_rep && r.account_rep.trim()) set.add(r.account_rep.trim());
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    return rows.filter((r) => {
      const stageOk = stage === "all" || (r.stage ?? "") === stage;
      const repOk = rep === "all" || (r.account_rep ?? "").toLowerCase() === rep.toLowerCase();
      const nameOk = q.length === 0 || (r.name ?? "").toLowerCase().includes(q);
      return stageOk && repOk && nameOk;
    });
  }, [rows, stage, rep, companyQuery]);

  /* ---------- Utils ---------- */

  const currency = (v: string | number | null | undefined): string => {
    const n =
      v === null || v === undefined || (typeof v === "string" && v.trim() === "")
        ? NaN
        : typeof v === "number"
        ? v
        : Number(v);
    return Number.isFinite(n)
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
      : "—";
  };

  const resetFilters = () => {
    setStage("all");
    setRep("all");
    setCompanyQuery("");
  };

  /* ---------- Actions ---------- */

  async function handleDeleteDeal(id: number) {
    if (!confirm("Delete this deal? This cannot be undone.")) return;
    const { error } = await supabase.from("deals").delete().eq("id", id).select();
    if (error) {
      alert("Delete failed: " + error.message);
      return;
    }
    setReloadKey((k) => k + 1);
  }

  /* ---------- Render ---------- */

  return (
    <section className="space-y-4">

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            {/* Stage */}
            <label className="text-sm text-sc-delft/70">
              Stage
              <select
                className="ml-2 border rounded-md px-2 py-1 text-sm"
                value={stage}
                onChange={(e) => setStage(e.target.value as StageFilter)}
              >
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </label>

            {/* Rep */}
            <label className="text-sm text-sc-delft/70">
              Rep
              <select
                className="ml-2 border rounded-md px-2 py-1 text-sm min-w-40"
                value={rep}
                onChange={(e) => setRep(e.target.value)}
              >
                {reps.map((r) => (
                  <option key={r} value={r}>
                    {r === "all" ? "All" : r}
                  </option>
                ))}
              </select>
            </label>

            {/* Company name search */}
            <div className="flex items-center">
              <input
                className="border rounded-md px-2 py-1 text-sm w-56"
                placeholder="Search company name…"
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => setOpenAdd(true)}>Add Deal</Button>
            <Button onClick={resetFilters} variant="secondary">Reset</Button>
          </div>
        </div>
      </Card>

      {err && <div className="text-sm text-red-600">Error loading deals: {err}</div>}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 text-sm text-sc-delft/60">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-sc-delft/60">No matching deals</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">Deal / Company</th>
                <th className="px-4 py-2 text-left">Location</th>
                <th className="px-4 py-2 text-center">Rep</th>
                <th className="px-4 py-2 text-center">Stage</th>
                <th className="px-4 py-2 text-right">Value</th>
                <th className="px-4 py-2 text-center">Close Date</th>
                <th className="px-4 py-2 text-right">Actions</th>{/* NEW */}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="font-medium">{d.name ?? "Untitled"}</div>
                    <div className="text-xs text-gray-500">
                      {d.invoice_number ? `Invoice: ${d.invoice_number}` : `ID: ${d.id}`}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {d.city ?? "—"}, {d.state ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {d.account_rep ?? "Unassigned"}
                  </td>
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
                  <td className="px-4 py-2 text-right font-medium text-sc-delft">
                    {currency(d.value)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {d.close_date ? new Date(d.close_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs underline text-sc-delft/70 hover:text-sc-orange mr-3"
                      onClick={() => setEditDeal(d)}
                      aria-label={`Edit ${d.name ?? `deal #${d.id}`}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-xs underline text-red-600 hover:text-red-700"
                      onClick={() => handleDeleteDeal(d.id)}
                      aria-label={`Delete ${d.name ?? `deal #${d.id}`}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Add Deal Modal */}
      <Modal open={openAdd} title="Add Deal" onClose={() => setOpenAdd(false)}>
        <DealForm
          onDone={() => {
            setOpenAdd(false);
            setReloadKey((k) => k + 1);
          }}
        />
      </Modal>

      {/* Edit Deal Modal */}
      {editDeal && (
        <EditDealModal
          deal={editDeal}
          onClose={() => setEditDeal(null)}
          onSaved={() => {
            setEditDeal(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </section>
  );
}

/* ---------- Inline Edit Modal ---------- */

function EditDealModal({
  deal,
  onClose,
  onSaved,
}: {
  deal: DealRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: deal.name ?? "",
    city: deal.city ?? "",
    state: deal.state ?? "",
    account_rep: deal.account_rep ?? "",
    value: deal.value ?? "",
    stage: (deal.stage as "paid" | "unpaid") ?? "unpaid",
    close_date: deal.close_date ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  async function save() {
    setBusy(true);
    setErr(null);

    const payload = {
      name: form.name || null,
      city: form.city || null,
      state: form.state || null,
      account_rep: form.account_rep || null,
      value: form.value === "" ? null : Number(form.value),
      stage: form.stage || null,
      close_date: form.close_date || null,
    };

    const { error } = await supabase.from("deals").update(payload).eq("id", deal.id);
    setBusy(false);
    if (error) setErr(error.message);
    else onSaved();
  }

  return (
    <Modal open title={`Edit Deal — ${deal.name ?? `#${deal.id}`}`} onClose={onClose}>
      <div className="space-y-3">
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
            <input name="value" type="number" min="0" className="mt-1 w-full border rounded px-2 py-1" value={form.value as any} onChange={handle}/>
          </label>
          <label className="text-sm">Stage
            <select name="stage" className="mt-1 w-full border rounded px-2 py-1" value={form.stage} onChange={handle}>
              <option value="unpaid">unpaid</option>
              <option value="paid">paid</option>
            </select>
          </label>
          <label className="text-sm col-span-2">Close Date
            <input name="close_date" type="date" className="mt-1 w-full border rounded px-2 py-1" value={form.close_date ?? ""} onChange={handle}/>
          </label>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Changes"}</Button>
        </div>
      </div>
    </Modal>
  );
}
