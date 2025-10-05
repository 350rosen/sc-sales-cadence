// src/pages/MyDeals.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { PageHeader, Card, Button } from "../components/ui";
import Modal from "../components/forms/Modal";
import AddDealExtendedForm from "../components/forms/DealForm";
import { useRole } from "../services/useRole";

/* -------------------- Types -------------------- */
type Deal = {
  id: number;
  name: string | null;
  city: string | null;
  state: string | null;
  stage: "paid" | "unpaid" | null;
  value: number | null;
  close_date: string | null;
  account_rep: string | null;
};

type ScheduleRow = {
  rep_name: string;
  rate_pct: number | string;
  active: boolean;
  minimum: number | string | null;
  maximum: number | string | null;
};

/* -------------------- Constants / helpers -------------------- */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const PAID_STAGES = ["paid", "paid (closed won)", "closed won (paid)"];

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
/** Normalize active tiers → progressive brackets with capacities */
function normalizeBrackets(rows: ScheduleRow[]) {
  const active = (rows ?? []).filter((t) => !!t.active);
  const tiers = active
    .map((t) => ({
      min: t.minimum == null ? 0 : toNumber(t.minimum as any),
      max: t.maximum == null ? null : toNumber(t.maximum as any),
      rate: toNumber(t.rate_pct as any), // percentage number
    }))
    .sort((a, b) => a.min - b.min);

  const caps = tiers.map((t) =>
    t.max == null ? Number.POSITIVE_INFINITY : Math.max(0, t.max - t.min)
  );
  return { tiers, caps };
}
/** Progressive commission across brackets for a single aggregate */
function computeTotalWithBrackets(sum: number, scheduleRows: ScheduleRow[]) {
  const { tiers, caps } = normalizeBrackets(scheduleRows);
  let remaining = sum;
  let commission = 0;
  const parts: string[] = [];

  for (let i = 0; i < tiers.length && remaining > 0; i++) {
    const take = Math.min(remaining, caps[i]);
    if (take > 0) {
      const piece = (take * tiers[i].rate) / 100;
      commission += piece;
      const label =
        tiers[i].max == null
          ? `${money(tiers[i].min)}+`
          : `${money(tiers[i].min)} – ${money(tiers[i].max!)}`;
      parts.push(`${label} @ ${tiers[i].rate}% → ${money(round2(piece))}`);
      remaining -= take;
    }
  }
  const effectivePct = sum > 0 ? (commission / sum) * 100 : 0;
  return {
    commission: round2(commission),
    effectivePct: round2(effectivePct),
    breakdown: parts.join("; "),
  };
}

/* -------------------- Commission Summary Card -------------------- */
function Stat({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-md border border-sc-delft/10 p-3">
      <div className="text-xs text-sc-delft/60">{label}</div>
      <div className="text-lg font-semibold text-sc-delft">
        {loading ? "—" : value}
      </div>
    </div>
  );
}

function CommissionSummaryCard({
  repName,
  start,
  end,
  onChangeStart,
  onChangeEnd,
}: {
  repName: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  onChangeStart: (d: string) => void;
  onChangeEnd: (d: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [totalPaid, setTotalPaid] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [commission, setCommission] = useState(0);
  const [effectiveRate, setEffectiveRate] = useState(0);
  const [breakdown, setBreakdown] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!repName) {
      // No profile name yet — just clear and wait
      setTotalPaid(0);
      setPaidCount(0);
      setCommission(0);
      setEffectiveRate(0);
      setBreakdown("");
      return;
    }

    (async () => {
      setBusy(true);
      setErr(null);

      // 1) fetch this rep's deals in date range
      const { data: deals, error: dealsErr } = await supabase
        .from("deals")
        .select("stage, value, close_date, account_rep")
        .not("close_date", "is", null)
        .gte("close_date", start)
        .lte("close_date", end)
        .eq("account_rep", repName);

      if (dealsErr) {
        if (!cancelled) {
          setErr(dealsErr.message);
          setBusy(false);
        }
        return;
      }

      const paidRows =
        (deals ?? []).filter((d: any) =>
          PAID_STAGES.includes(String(d.stage ?? "").toLowerCase())
        ) || [];

      const sumPaid = paidRows.reduce((acc: number, r: any) => acc + toNumber(r.value), 0);

      // 2) load this rep's commission tiers
      const { data: tiers, error: tiersErr } = await supabase
        .from("commission_schedules")
        .select("rep_name, rate_pct, active, minimum, maximum")
        .eq("rep_name", repName);

      if (tiersErr) {
        if (!cancelled) {
          setErr(tiersErr.message);
          setBusy(false);
        }
        return;
      }

      // 3) compute progressive commission for the aggregate
      const { commission, effectivePct, breakdown } = computeTotalWithBrackets(
        sumPaid,
        (tiers ?? []) as ScheduleRow[]
      );

      if (!cancelled) {
        setPaidCount(paidRows.length);
        setTotalPaid(round2(sumPaid));
        setCommission(commission);
        setEffectiveRate(effectivePct);
        setBreakdown(breakdown);
        setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [repName, start, end]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sc-delft">Commission Summary</div>
        <div className="text-xs text-sc-delft/60">{repName || "—"}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Start
          <input
            type="date"
            className="mt-1 w-full border rounded px-2 py-1 text-sm"
            value={start}
            onChange={(e) => onChangeStart(e.target.value)}
          />
        </label>
        <label className="text-sm">
          End
          <input
            type="date"
            className="mt-1 w-full border rounded px-2 py-1 text-sm"
            value={end}
            onChange={(e) => onChangeEnd(e.target.value)}
          />
        </label>
      </div>

      {err && <div className="text-sm text-red-600">Error: {err}</div>}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Paid Total" value={money(totalPaid)} loading={busy} />
        <Stat label="Commission Due" value={money(commission)} loading={busy} />
        <Stat
          label="Effective Rate"
          value={`${effectiveRate.toFixed(2)}%`}
          loading={busy}
        />
      </div>

      <div className="text-xs text-sc-delft/70">
        {busy ? "Calculating…" : paidCount === 0 ? "No paid deals in range." : breakdown}
      </div>
    </Card>
  );
}

/* -------------------- Page -------------------- */
export default function MyDeals() {
  // unified date range (YTD by default)
  const today = iso(new Date());
  const jan1 = iso(new Date(new Date().getFullYear(), 0, 1));
  const [start, setStart] = useState(jan1);
  const [end, setEnd] = useState(today);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { profile, loading: roleLoading } = useRole();
  const repName = (profile?.full_name || "").trim();

  const notifyReload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (roleLoading || !repName) return;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("deals")
        .select("id,name,city,state,stage,value,close_date,account_rep")
        .not("close_date", "is", null)
        .gte("close_date", start)
        .lte("close_date", end)
        .eq("account_rep", repName)
        .order("close_date", { ascending: false });

      if (error) {
        setErr(error.message);
        setDeals([]);
      } else {
        setDeals((data ?? []).map((d) => ({ ...d, stage: d.stage as any })));
      }
      setLoading(false);
    })();
  }, [repName, roleLoading, start, end, reloadKey]);

  return (
    <section className="space-y-4">
      <PageHeader
        title="My Deals"
        cta={<Button onClick={() => setOpenAdd(true)}>Add New Deal</Button>}
      />

      <Card className="p-3 text-sm text-sc-delft/70">
        Signed in as <b>{repName || "—"}</b>. You can add new deals and view the status of the
        deals assigned to you.
      </Card>

      {/* Commission summary shares the same date range as the grid */}
      <CommissionSummaryCard
        repName={repName}
        start={start}
        end={end}
        onChangeStart={setStart}
        onChangeEnd={setEnd}
      />

      {err && <div className="text-sm text-red-600">Error: {err}</div>}

      {roleLoading || !repName ? (
        <Card className="p-3 text-sc-delft/60">Loading profile…</Card>
      ) : loading ? (
        <Card className="p-3 text-sc-delft/60">Loading…</Card>
      ) : deals.length === 0 ? (
        <Card className="p-3 text-sc-delft/60">
          No deals in this range for {repName || "you"}.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="border-b bg-sc-offwhite/30 text-sc-delft/80">
              <tr>
                <th className="text-left px-3 py-2">Deal</th>
                <th className="text-left px-3 py-2">Location</th>
                <th className="text-left px-3 py-2">Rep</th> {/* shows who it's assigned to */}
                <th className="text-left px-3 py-2">Stage</th>
                <th className="text-right px-3 py-2">Value</th>
                <th className="text-left px-3 py-2">Close Date</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-sc-offwhite/40">
                  <td className="px-3 py-2">{d.name}</td>
                  <td className="px-3 py-2">
                    {[d.city, d.state].filter(Boolean).join(", ")}
                  </td>
                  <td className="px-3 py-2">{d.account_rep ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        d.stage === "paid"
                          ? "bg-sc-lightgreen/20 text-sc-green"
                          : "bg-sc-orange/20 text-sc-orange"
                      }`}
                    >
                      {d.stage ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {d.value != null ? `$${Number(d.value).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2">{d.close_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={openAdd} title="Add Deal" onClose={() => setOpenAdd(false)}>
        <AddDealExtendedForm
          onDone={() => {
            setOpenAdd(false);
            notifyReload();
          }}
        />
      </Modal>
    </section>
  );
}
