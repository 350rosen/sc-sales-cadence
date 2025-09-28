import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, PageHeader } from "../components/ui";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";

type Deal = {
  id: string;
  name: string;
  value: number | string | null;
  stage: "paid" | "unpaid" | string | null;
  close_date: string | null;
  account_rep: string | null;
};

const PIE_COLORS = ["#98C93C", "#F58529"]; // paid, unpaid
const BAR_COLOR = "#29335C"; // delft

export default function Dashboard() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("id, name, value, stage, close_date, account_rep")
        .order("close_date", { ascending: true });

      if (error) {
        console.error("Supabase error:", error);
        setErr(error.message);
        setDeals([]);
      } else {
        const mapped: Deal[] = (data ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          value: d.value === null ? 0 : Number(d.value),
          stage: d.stage ? String(d.stage).toLowerCase() : null,
          close_date: d.close_date,
          account_rep: d.account_rep ?? null,
        }));
        setDeals(mapped);
      }
      setLoading(false);
    })();
  }, []);

  const {
    totalRevenue,
    paidDeals,
    unpaidDeals,
    paidPct,
    revenueTrend,
    pieData,
    topDeals,
    repsTable,
    repsBarData,
  } = useMemo(() => {
    const safe = deals ?? [];
    const isPaid = (s: Deal["stage"]) => (s ?? "").toString().toLowerCase() === "paid";

    const totalRevenue = safe.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    const paidDeals = safe.filter(d => isPaid(d.stage)).length;
    const unpaidDeals = safe.filter(d => !isPaid(d.stage)).length;
    const paidPct = (paidDeals + unpaidDeals) === 0 ? 0 : Math.round((paidDeals / (paidDeals + unpaidDeals)) * 100);

    // 6-month revenue trend
    const now = new Date();
    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const label = start.toLocaleString(undefined, { month: "short" });
      months.push({ label, start, end });
    }
    const revenueTrend = months.map(m => {
      const revenue = safe
        .filter(d => d.close_date)
        .filter(d => {
          const cd = new Date(d.close_date as string);
          return cd >= m.start && cd < m.end;
        })
        .reduce((sum, d) => sum + (Number(d.value) || 0), 0);
      return { month: m.label, revenue };
    });

    const pieData = [
      { name: "Paid", value: paidDeals },
      { name: "Unpaid", value: unpaidDeals },
    ];

    const topDeals = [...safe]
      .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
      .slice(0, 3);

    // ---- Rep breakdown ----
    type RepAgg = {
      rep: string; revenue: number; paid: number; unpaid: number; paidPct: number;
    };
    const byRep = new Map<string, RepAgg>();
    for (const d of safe) {
      const rep = (d.account_rep || "Unassigned").toString();
      const agg = byRep.get(rep) ?? { rep, revenue: 0, paid: 0, unpaid: 0, paidPct: 0 };
      agg.revenue += Number(d.value) || 0;
      if (isPaid(d.stage)) agg.paid += 1; else agg.unpaid += 1;
      byRep.set(rep, agg);
    }
    const repsTable = Array.from(byRep.values())
      .map(r => ({ ...r, paidPct: (r.paid + r.unpaid) ? Math.round((r.paid / (r.paid + r.unpaid)) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    const repsBarData = repsTable.map(r => ({ rep: r.rep, revenue: r.revenue }));

    return { totalRevenue, paidDeals, unpaidDeals, paidPct, revenueTrend, pieData, topDeals, repsTable, repsBarData };
  }, [deals]);

  return (
    <section className="space-y-6">
      <PageHeader title="Dashboard" />

      {/* Optional debug */}
      {!loading && <div className="text-xs text-sc-delft/60">{err ? `Error: ${err}` : `rows: ${deals.length}`}</div>}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-sc-delft/70">Total Revenue</div>
          <div className="mt-2 text-2xl font-semibold text-sc-delft">
            {loading ? "…" : `$${totalRevenue.toLocaleString()}`}
          </div>
          <div className="mt-1 text-xs text-sc-delft/60">Sum of all deals</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-sc-delft/70">Paid Deals</div>
          <div className="mt-2 text-2xl font-semibold text-sc-delft">{loading ? "…" : paidDeals}</div>
          <div className="mt-1 text-xs text-sc-green">Collected</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-sc-delft/70">Unpaid Deals</div>
          <div className="mt-2 text-2xl font-semibold text-sc-delft">{loading ? "…" : unpaidDeals}</div>
          <div className="mt-1 text-xs text-sc-orange">Outstanding</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-sc-delft/70">% Paid</div>
          <div className="mt-2 text-2xl font-semibold text-sc-delft">{loading ? "…" : `${paidPct}%`}</div>
          <div className="mt-1 text-xs text-sc-delft/60">Paid / All</div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-4 lg:col-span-2">
          <div className="font-medium mb-2 text-sc-delft">Revenue Trend</div>
          <div className="text-sm text-sc-delft/70 mb-4">Sum of deal values by close month</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EF" />
                <XAxis dataKey="month" stroke="#7C8698" />
                <YAxis stroke="#7C8698" />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="#29335C" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-medium mb-2 text-sc-delft">Paid vs Unpaid</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 text-sm text-sc-delft/80 space-y-1">
            {pieData.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {p.name}: {p.value}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Top deals + Rep overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4">
          <div className="font-medium mb-3 text-sc-delft">Top Deals</div>
          {loading ? (
            <div className="text-sc-delft/60">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-sc-delft/60">
                  <th className="py-2">Deal</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>Close Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {topDeals.map((d) => {
                  const paid = (d.stage ?? "").toLowerCase() === "paid";
                  return (
                    <tr key={d.id} className="hover:bg-sc-lightgreen/10">
                      <td className="py-2">{d.name}</td>
                      <td className="font-medium text-sc-green">
                        {d.value ? `$${Number(d.value).toLocaleString()}` : "—"}
                      </td>
                      <td>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs
                          ${paid ? "bg-sc-lightgreen/20 text-sc-green" : "bg-sc-orange/20 text-sc-orange"}`}>
                          {paid ? "Paid" : "Unpaid"}
                        </span>
                      </td>
                      <td>{d.close_date ? new Date(d.close_date).toLocaleDateString() : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        {/* Rep Overview */}
        <Card className="p-4">
          <div className="font-medium mb-3 text-sc-delft">Rep Overview</div>
          {loading ? (
            <div className="text-sc-delft/60">Loading…</div>
          ) : deals.length === 0 ? (
            <div className="text-sc-delft/60">No deals yet</div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-sc-delft/60">
                    <th className="py-2">Rep</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-center">Paid</th>
                    <th className="text-center">Unpaid</th>
                    <th className="text-center">% Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {repsTable.map((r) => (
                    <tr key={r.rep} className="hover:bg-sc-lightgreen/10">
                      <td className="py-2">{r.rep}</td>
                      <td className="text-right font-medium text-sc-delft">${r.revenue.toLocaleString()}</td>
                      <td className="text-center text-sc-green">{r.paid}</td>
                      <td className="text-center text-sc-orange">{r.unpaid}</td>
                      <td className="text-center">{r.paidPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="h-48 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={repsBarData} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EF" />
                    <XAxis dataKey="rep" stroke="#7C8698" />
                    <YAxis stroke="#7C8698" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill={BAR_COLOR} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Card>
      </div>
    </section>
  );
}
