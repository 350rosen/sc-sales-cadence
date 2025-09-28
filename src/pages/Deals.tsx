import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Button, Card } from "../components/ui";
import Modal from "../components/forms/Modal";
import DealForm from "../components/forms/DealForm";

type DealRow = {
  id: number;
  name: string | null;          // company name
  city: string | null;
  state: string | null;
  stage: string | null;         // 'paid' | 'unpaid'
  account_rep: string | null;
  value: string | number | null;
  close_date: string | null;    // YYYY-MM-DD
};

type StageFilter = "all" | "paid" | "unpaid";

export default function Deals() {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filters
  const [stage, setStage] = useState<StageFilter>("all");
  const [rep, setRep] = useState<string>("all");
  const [companyQuery, setCompanyQuery] = useState<string>("");

  // Modal + reload
  const [openAdd, setOpenAdd] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("deals")
        .select("id, name, city, state, stage, account_rep, value, close_date, created_at")
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
  }, [reloadKey]); // 👈 refetch after a successful add

  // Build unique rep list (sorted)
  const reps = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.account_rep && r.account_rep.trim()) set.add(r.account_rep.trim());
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  // Filtered rows
  const filtered = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    return rows.filter((r) => {
      const stageOk = stage === "all" || (r.stage ?? "") === stage;
      const repOk = rep === "all" || (r.account_rep ?? "").toLowerCase() === rep.toLowerCase();
      const nameOk = q.length === 0 || (r.name ?? "").toLowerCase().includes(q);
      return stageOk && repOk && nameOk;
    });
  }, [rows, stage, rep, companyQuery]);

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
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="font-medium">{d.name ?? "Untitled"}</div>
                    <div className="text-xs text-gray-500">ID: {d.id}</div>
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
            setReloadKey((k) => k + 1); // 👈 refetch list after save
          }}
        />
      </Modal>
    </section>
  );
}
