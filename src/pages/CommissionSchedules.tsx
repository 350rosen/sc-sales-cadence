import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { PageHeader, Card, Button } from "../components/ui";
import Modal from "../components/forms/Modal";

/* ---------- Types ---------- */

type ScheduleRow = {
  id: number;
  rep_name: string;
  rate_pct: number | string;
  notes: string | null;
  active: boolean;
  created_at: string;
  minimum: number | string | null;
  maximum: number | string | null;
};

type Tier = {
  rowId: number;              // tie back to DB id
  minimum: number | null;
  maximum: number | null;     // null = open-ended
  rate_pct: number;
  active: boolean;
  notes?: string | null;
};

type RepGroup = {
  rep: string;
  active: boolean;            // any tier active = Active
  tiers: Tier[];              // sorted by minimum asc
};

/* ---------- Helpers ---------- */

const money = (v: number | string | null | undefined) => {
  const n =
    typeof v === "number" ? v : v == null || v === "" ? NaN : Number(String(v));
  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
    : "—";
};

const toNum = (v: number | string | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
};

/* ---------- Page ---------- */

export default function CommissionSchedules() {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [openAdd, setOpenAdd] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");

  // edit modal state
  const [editTier, setEditTier] = useState<null | (Tier & { rep: string })>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("commission_schedules")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<ScheduleRow[]>();

      if (error) {
        setErr(error.message);
        setRows([]);
      } else {
        setErr(null);
        setRows(data ?? []);
      }
      setLoading(false);
    })();
  }, [reloadKey]);

  // Filter by rep name
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => r.rep_name.toLowerCase().includes(q));
  }, [rows, query]);

  // Group by rep and build tiers list
  const groups: RepGroup[] = useMemo(() => {
    const map = new Map<string, RepGroup>();

    for (const r of filtered) {
      const rep = r.rep_name;
      if (!map.has(rep)) {
        map.set(rep, { rep, active: false, tiers: [] });
      }
      const g = map.get(rep)!;

      const tier: Tier = {
        rowId: r.id,
        minimum: toNum(r.minimum),
        maximum: toNum(r.maximum),
        rate_pct: Number(r.rate_pct ?? 0),
        active: !!r.active,
        notes: r.notes,
      };
      g.tiers.push(tier);
      if (tier.active) g.active = true;
    }

    // sort tiers by minimum asc (null treated as 0)
    for (const g of map.values()) {
      g.tiers.sort((a, b) => (a.minimum ?? 0) - (b.minimum ?? 0));
    }

    // sort groups by rep name
    return Array.from(map.values()).sort((a, b) => a.rep.localeCompare(b.rep));
  }, [filtered]);

  /* ---------- Actions ---------- */

  async function handleDeleteTier(rowId: number) {
    if (!confirm("Delete this tier? This cannot be undone.")) return;
    const { error } = await supabase
      .from("commission_schedules")
      .delete()
      .eq("id", rowId);

    if (error) {
      alert("Delete failed: " + error.message);
      return;
    }
    setReloadKey((k) => k + 1);
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="Commission Schedules"
        cta={<Button onClick={() => setOpenAdd(true)}>Add Schedule</Button>}
      />

      <Card className="p-3 flex items-center gap-3">
        <input
          className="border rounded-md px-2 py-1 text-sm w-64"
          placeholder="Filter by rep…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="secondary" onClick={() => setQuery("")}>Reset</Button>
      </Card>

      {err && <div className="text-sm text-red-600">Error: {err}</div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <Card className="p-4 text-sc-delft/60">Loading…</Card>
        ) : groups.length === 0 ? (
          <Card className="p-4 text-sc-delft/60">No schedules</Card>
        ) : (
          groups.map((g) => (
            <Card key={g.rep} className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sc-delft">{g.rep}</div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    g.active ? "bg-sc-lightgreen/20 text-sc-green" : "bg-sc-orange/20 text-sc-orange"
                  }`}
                >
                  {g.active ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Tiers: range left | percent + Edit + Delete right */}
              <div className="mt-3 space-y-0.5">
                {g.tiers.map((t, i) => {
                  const rangeLabel =
                    t.maximum === null
                      ? `${money(t.minimum ?? 0)}+`
                      : `${money(t.minimum ?? 0)} – ${money(t.maximum)}`;

                  const inactive = !t.active ? "text-sc-delft/50" : "";
                  const rate = `${Number(t.rate_pct).toFixed(2)}%`;

                  return (
                    <div
                      key={t.rowId}
                      className={`flex items-center justify-between gap-3 py-2 ${
                        i > 0 ? "border-t border-sc-delft/10" : ""
                      }`}
                    >
                      {/* Left: range */}
                      <div className={`text-sm ${inactive}`}>{rangeLabel}</div>

                      {/* Right: % + Edit + Delete */}
                      <div className="flex items-center gap-3">
                        <div className={`text-sm font-semibold ${inactive}`}>{rate}</div>

                        <button
                          className="text-xs underline underline-offset-2 text-sc-delft/70 hover:text-sc-orange transition-colors"
                          onClick={() => setEditTier({ ...t, rep: g.rep })}
                          aria-label={`Edit tier for ${g.rep}`}
                        >
                          Edit
                        </button>

                        <button
                          className="text-xs underline underline-offset-2 text-red-600 hover:text-red-700 transition-colors"
                          onClick={() => handleDeleteTier(t.rowId)}
                          aria-label={`Delete tier for ${g.rep}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Optional: show first non-empty notes */}
              {g.tiers.some((t) => t.notes) && (
                <div className="mt-3 text-xs text-sc-delft/70">
                  {g.tiers.find((t) => t.notes)?.notes}
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Add Schedule */}
      <Modal
        open={openAdd}
        title="Add Commission Schedule"
        onClose={() => setOpenAdd(false)}
      >
        <AddScheduleForm
          onDone={() => {
            setOpenAdd(false);
            setReloadKey((k) => k + 1);
          }}
        />
      </Modal>

      {/* Edit Tier */}
      {editTier && (
        <EditTierModal
          tier={editTier}
          onClose={() => setEditTier(null)}
          afterSave={() => setReloadKey((k) => k + 1)}
        />
      )}
    </section>
  );
}

/* ---------- Add Schedule Form ---------- */

function AddScheduleForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    rep_name: "",
    rate_pct: "10",
    minimum: "",
    maximum: "",
    notes: "",
    active: "true",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handle = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);

    const minNum = form.minimum !== "" ? Number(form.minimum) : null;
    const maxNum = form.maximum !== "" ? Number(form.maximum) : null;
    if (minNum !== null && maxNum !== null && minNum > maxNum) {
      setErr("Minimum cannot be greater than maximum.");
      setBusy(false);
      return;
    }

    const payload = {
      rep_name: form.rep_name || null,
      rate_pct: form.rate_pct ? Number(form.rate_pct) : 0,
      minimum: minNum,
      maximum: maxNum, // null means open-ended (e.g., "$25,000+")
      notes: form.notes || null,
      active: form.active === "true",
    };

    const { error } = await supabase.from("commission_schedules").insert(payload);

    setBusy(false);
    if (error) setErr(error.message);
    else onDone();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Rep
          <input
            name="rep_name"
            className="mt-1 w-full border rounded px-2 py-1"
            value={form.rep_name}
            onChange={handle}
          />
        </label>
        <label className="text-sm">Rate %
          <input
            name="rate_pct"
            type="number"
            step="0.1"
            min="0"
            className="mt-1 w-full border rounded px-2 py-1"
            value={form.rate_pct}
            onChange={handle}
          />
        </label>
        <label className="text-sm">Minimum ($)
          <input
            name="minimum"
            type="number"
            step="0.01"
            min="0"
            className="mt-1 w-full border rounded px-2 py-1"
            value={form.minimum}
            onChange={handle}
            placeholder="0"
          />
        </label>
        <label className="text-sm">Maximum ($)
          <input
            name="maximum"
            type="number"
            step="0.01"
            min="0"
            className="mt-1 w-full border rounded px-2 py-1"
            value={form.maximum}
            onChange={handle}
            placeholder="leave blank for open-ended"
          />
        </label>
        <label className="text-sm">Status
          <select
            name="active"
            className="mt-1 w-full border rounded px-2 py-1"
            value={form.active}
            onChange={handle}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
        <div />
        <label className="text-sm col-span-2">Notes
          <textarea
            name="notes"
            className="mt-1 w-full border rounded px-2 py-1"
            rows={3}
            value={form.notes}
            onChange={handle}
          />
        </label>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Save Schedule"}
        </Button>
      </div>
    </div>
  );
}

/* ---------- Edit Tier Modal ---------- */

function EditTierModal({
  tier,
  onClose,
  afterSave,
}: {
  tier: Tier & { rep: string };
  onClose: () => void;
  afterSave: () => void;
}) {
  const [form, setForm] = useState({
    rate_pct: tier.rate_pct.toString(),
    minimum: tier.minimum ?? "",
    maximum: tier.maximum ?? "",
    active: tier.active ? "true" : "false",
    notes: tier.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handle = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);

    const minNum = form.minimum !== "" ? Number(form.minimum) : null;
    const maxNum = form.maximum !== "" ? Number(form.maximum) : null;
    if (minNum !== null && maxNum !== null && minNum > maxNum) {
      setErr("Minimum cannot be greater than maximum.");
      setBusy(false);
      return;
    }

    const payload = {
      rate_pct: form.rate_pct ? Number(form.rate_pct) : 0,
      minimum: minNum,
      maximum: maxNum,
      active: form.active === "true",
      notes: form.notes || null,
    };

    const { error } = await supabase
      .from("commission_schedules")
      .update(payload)
      .eq("id", tier.rowId);

    setBusy(false);
    if (error) setErr(error.message);
    else {
      afterSave();
      onClose();
    }
  };

  return (
    <Modal open title={`Edit Tier — ${tier.rep}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Rate %
            <input
              name="rate_pct"
              type="number"
              step="0.1"
              min="0"
              className="mt-1 w-full border rounded px-2 py-1"
              value={form.rate_pct}
              onChange={handle}
            />
          </label>
          <label className="text-sm">Status
            <select
              name="active"
              className="mt-1 w-full border rounded px-2 py-1"
              value={form.active}
              onChange={handle}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          <label className="text-sm">Minimum ($)
            <input
              name="minimum"
              type="number"
              step="0.01"
              min="0"
              className="mt-1 w-full border rounded px-2 py-1"
              value={form.minimum}
              onChange={handle}
              placeholder="0"
            />
          </label>
          <label className="text-sm">Maximum ($)
            <input
              name="maximum"
              type="number"
              step="0.01"
              min="0"
              className="mt-1 w-full border rounded px-2 py-1"
              value={form.maximum}
              onChange={handle}
              placeholder="leave blank for open-ended"
            />
          </label>
          <label className="text-sm col-span-2">Notes
            <textarea
              name="notes"
              rows={3}
              className="mt-1 w-full border rounded px-2 py-1"
              value={form.notes}
              onChange={handle}
            />
          </label>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
