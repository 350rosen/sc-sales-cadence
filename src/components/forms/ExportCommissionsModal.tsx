import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Button } from "../ui";

type Props = { onDone: () => void; fixedRep?: string };

type DealRow = {
  id: number;
  name: string | null;
  city: string | null;
  state: string | null;
  stage: string | null;
  account_rep: string | null;
  value: string | number | null;
  close_date: string | null; // YYYY-MM-DD
};

type ScheduleRow = {
  id: number;
  rep_name: string;
  rate_pct: number | string;
  active: boolean;
  minimum: number | string | null;
  maximum: number | string | null;
};

// Case-insensitive list of stages treated as "paid"
const PAID_STAGES = ["paid", "paid (closed won)", "closed won (paid)"];

/* -------------------- Component -------------------- */

export default function ExportCommissionsModal({ onDone }: Props) {
  const [reps, setReps] = useState<string[]>([]);
  const [rep, setRep] = useState<string>("");
  const [start, setStart] = useState<string>(""); // YYYY-MM-DD
  const [end, setEnd] = useState<string>("");     // YYYY-MM-DD
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
      (async () => {
        const { data, error } = await supabase
          .from("commission_schedules")
          .select("rep_name")
          .order("rep_name", { ascending: true });

        if (error) {
          setErr(error.message);
          setReps([]);
          return;
        }
        const set = new Set<string>();
        (data ?? []).forEach((r: any) => {
          const v = (r.rep_name ?? "").toString().trim();
          if (v) set.add(v);
        });
        const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
        setReps(arr);
        if (!rep && arr.length) setRep(arr[0]);
      })();
    }, []);


  const canExport = useMemo(
    () => !!rep && !!start && !!end && !busy,
    [rep, start, end, busy]
  );

  /* -------------------- Export -------------------- */

  async function exportCsv() {
    if (!canExport) return;
    setBusy(true);
    setErr(null);

    // 1) Deals for rep within date range (order by close date)
    const { data: dealsData, error: dealsErr } = await supabase
      .from("deals")
      .select("id, name, city, state, stage, account_rep, value, close_date")
      .eq("account_rep", rep)
      .not("close_date", "is", null)
      .gte("close_date", start)
      .lte("close_date", end)
      .order("close_date", { ascending: true });

    if (dealsErr) {
      setBusy(false);
      setErr(dealsErr.message);
      return;
    }

    const allRows = (dealsData as DealRow[]) ?? [];
    const paidRows = allRows.filter((r) =>
      PAID_STAGES.includes((r.stage ?? "").toLowerCase())
    );

    // 2) Aggregate sum for PAID deals
    const totalValue = paidRows.reduce((sum, r) => sum + toNumber(r.value), 0);

    // 3) Load rep commission tiers
    const { data: tiersData, error: tiersErr } = await supabase
      .from("commission_schedules")
      .select("rep_name, rate_pct, active, minimum, maximum")
      .eq("rep_name", rep);

    if (tiersErr) {
      setBusy(false);
      setErr(tiersErr.message);
      return;
    }

    // 4) Compute progressive commission for the aggregate
    const {
      commission: totalCommission,
      effectivePct,
      breakdown,
    } = computeTotalWithBrackets(totalValue, (tiersData as ScheduleRow[]) ?? []);

    // 5) Build CSV: deal rows (no per-deal commission), then summary row
    const header = [
      "row_type",              // "deal" or "summary"
      "id",
      "company",
      "city",
      "state",
      "rep",
      "stage",
      "value_usd",
      "close_date",
      "total_value_usd",       // filled only on summary row
      "commission_usd",        // filled only on summary row
      "effective_rate_pct",    // filled only on summary row
      "bracket_breakdown"      // filled only on summary row
    ];

    const lines: string[] = [header.join(",")];

    // Deal rows
    for (const r of paidRows) {
      const value = toNumber(r.value);
      const cells = [
        "deal",
        r.id,
        csvSafe(r.name),
        csvSafe(r.city),
        csvSafe(r.state),
        csvSafe(r.account_rep),
        csvSafe(r.stage),
        value.toFixed(2),
        csvSafe(r.close_date),
        "", // total_value_usd
        "", // commission_usd
        "", // effective_rate_pct
        "", // bracket_breakdown
      ];
      lines.push(cells.join(","));
    }

    // Summary row
    const summary = [
      "summary",
      "", // id
      "", // company
      "", // city
      "", // state
      csvSafe(rep),
      "", // stage
      "", // value_usd
      "", // close_date
      totalValue.toFixed(2),
      totalCommission.toFixed(2),
      (Math.round(effectivePct * 100) / 100).toFixed(2),
      csvSafe(breakdown),
    ];
    lines.push(summary.join(","));

    const csv = lines.join("\n");
    const fname = `commissions_${slug(rep)}_${start}_to_${end}.csv`;
    downloadCSV(fname, csv);

    setBusy(false);
    onDone();
  }

  /* -------------------- Render -------------------- */

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Rep
          <select
            className="mt-1 w-full border rounded px-2 py-1 text-sm"
            value={rep}
            onChange={(e) => setRep(e.target.value)}
          >
            {reps.length === 0 ? (
              <option value="">No reps</option>
            ) : reps.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>

        <div /> {/* no manual rate when using progressive tiers */}

        <label className="text-sm">Start date
          <input
            type="date"
            className="mt-1 w-full border rounded px-2 py-1 text-sm"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>

        <label className="text-sm">End date
          <input
            type="date"
            className="mt-1 w-full border rounded px-2 py-1 text-sm"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
        Export lists each <span className="font-medium">Paid</span> deal in the period (no per-deal commission)
        and appends one <span className="font-medium">summary row</span> with progressive commission based on the rep’s schedule.
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button onClick={exportCsv} disabled={!canExport}>
          {busy ? "Exporting…" : "Export CSV"}
        </Button>
      </div>
    </div>
  );
}

/* -------------------- Helpers -------------------- */

function toNumber(v: string | number | null): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : 0;
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/** Normalize active tiers → brackets with capacities */
function normalizeBrackets(rows: ScheduleRow[]) {
  const active = (rows ?? []).filter((t) => !!t.active);
  const tiers = active
    .map((t) => ({
      min: t.minimum === null ? 0 : toNumber(t.minimum as any),
      max: t.maximum === null ? null : toNumber(t.maximum as any),
      rate: toNumber(t.rate_pct as any), // percent number
    }))
    .sort((a, b) => a.min - b.min);

  const caps = tiers.map((t) =>
    t.max === null ? Number.POSITIVE_INFINITY : Math.max(0, t.max - t.min)
  );
  return { tiers, caps };
}

/** Apply progressive brackets to an aggregate sum (0–cap1 at rate1, next at rate2, …) */
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
        tiers[i].max === null
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

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function csvSafe(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // quote if contains comma/quote/newline
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
