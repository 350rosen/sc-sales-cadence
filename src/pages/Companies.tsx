import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, Button } from "../components/ui";

type DealRow = {
  id: string;
  name: string | null;          // company name
  city: string | null;
  state: string | null;
  stage: string | null;         // 'paid' | 'unpaid'
  account_rep: string | null;
  close_date: string | null;    // YYYY-MM-DD
};

type CompanyCard = {
  key: string;
  name: string;
  city: string;
  state: string;
  openDeals: number;            // unpaid
  closedDeals: number;          // paid
  rep: string;                  // most frequent rep
  lastActivity: string | "none";
};

export default function Companies() {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("id, name, city, state, stage, account_rep, close_date")
        .returns<DealRow[]>();

      if (error) {
        console.error(error);
        setErr(error.message);
        setRows([]);
      } else {
        // normalize stage casing
        const normalized = (data ?? []).map((d) => ({
          ...d,
          stage: d.stage ? d.stage.toLowerCase() : null,
        }));
        setRows(normalized);
      }
      setLoading(false);
    })();
  }, []);

  const companies: CompanyCard[] = useMemo(() => {
    // Aggregate by name||city||state
    const map = new Map<
      string,
      CompanyCard & { _repCounts: Record<string, number> }
    >();

    for (const r of rows) {
      const name = (r.name ?? "Unknown Company").toString();
      const city = (r.city ?? "—").toString();
      const state = (r.state ?? "—").toString();
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
        });
      }

      const agg = map.get(key)!;

      // counts
      if ((r.stage ?? "") === "paid") agg.closedDeals += 1;
      else agg.openDeals += 1;

      // rep frequency
      const rep = r.account_rep ?? "Unassigned";
      agg._repCounts[rep] = (agg._repCounts[rep] ?? 0) + 1;

      // last activity = most recent close_date (if present)
      if (r.close_date) {
        const current = agg.lastActivity !== "none" ? new Date(agg.lastActivity) : null;
        const cd = new Date(r.close_date);
        if (!current || cd > current) agg.lastActivity = r.close_date;
      }
    }

    // finalize rep (pick most frequent)
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
      });
    }

    // sort by open deals desc, then name
    out.sort((a, b) => (b.openDeals - a.openDeals) || a.name.localeCompare(b.name));
    return out;
  }, [rows]);

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

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between rounded-md border border-sc-delft/15 px-3 py-2">
                  <span className="text-sm text-sc-delft/80">Open (unpaid)</span>
                  <span className="inline-flex items-center justify-center h-6 min-w-6 rounded-full bg-sc-orange/20 text-sc-orange text-xs px-2">
                    {c.openDeals}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-sc-delft/15 px-3 py-2">
                  <span className="text-sm text-sc-delft/80">Closed (paid)</span>
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
                {c.lastActivity === "none"
                  ? "None"
                  : new Date(c.lastActivity).toLocaleDateString()}
              </div>

              <div className="mt-4">
                <Button className="w-full">View Details</Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
