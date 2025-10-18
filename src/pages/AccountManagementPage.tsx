import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, PageHeader } from "../components/ui";

// Types
type AccountRow = {
  id: string;
  name: string | null;
  owner_email: string | null;
  plan: string | null;
  status: string | null;
  created_at: string | null;
};

type Profile = {
  id: string;
  email: string | null;
  role?: string | null;                 // ← include role
  created_at: string | null;
};

export default function AccountManagementPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // expand state and user cache
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [usersByAccount, setUsersByAccount] = useState<
    Record<string, { loading: boolean; rows: Profile[]; error?: string }>
  >({});

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("accounts_admin")
          .select("id, name, plan, status, created_at, owner_email")
          .order("created_at", { ascending: false });
        if (error) throw error;
        setAccounts((data as any) ?? []);
      } catch (e: any) {
        console.error(e);
        setErr(e.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      [a.name, a.owner_email, a.plan, a.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [accounts, search]);

  async function toggleOpen(accountId: string) {
    const next = { ...open, [accountId]: !open[accountId] };
    setOpen(next);

    // Lazy load users on first open via RPC (bypasses RLS but admin-gated)
    if (!usersByAccount[accountId]) {
      setUsersByAccount((m) => ({ ...m, [accountId]: { loading: true, rows: [] } }));
      const { data, error } = await supabase.rpc("admin_list_account_users", { aid: accountId });
      if (error) {
        setUsersByAccount((m) => ({
          ...m,
          [accountId]: { loading: false, rows: [], error: error.message },
        }));
      } else {
        setUsersByAccount((m) => ({
          ...m,
          [accountId]: { loading: false, rows: (data as any) ?? [] },
        }));
      }
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Account Management" />
      {!loading && (
        <div className="text-xs text-sc-delft/60">
          {err ? `Error: ${err}` : `rows: ${accounts.length}`}
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / email / plan / status…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sc-delft/40 sm:w-72"
          />
          <div className="text-xs text-sc-delft/60">{filtered.length} matching</div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-sc-delft/60">
                <th className="py-2 w-10" />
                <th className="py-2">Name</th>
                <th>Owner Email</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(loading ? [] : filtered).map((a) => (
                <Fragment key={a.id}>
                  <tr className="hover:bg-sc-lightgreen/10">
                    <td className="py-2">
                      <button
                        onClick={() => toggleOpen(a.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50"
                        aria-label={open[a.id] ? "Collapse" : "Expand"}
                      >
                        <span className={`transition-transform ${open[a.id] ? "rotate-90" : ""}`}>▶</span>
                      </button>
                    </td>
                    <td className="py-2 font-medium text-sc-delft">{a.name}</td>
                    <td className="text-sc-delft/90">{a.owner_email ?? "—"}</td>
                    <td className="uppercase tracking-wide text-xs text-sc-delft/80">{a.plan ?? "—"}</td>
                    <td className="text-sc-delft/80">{a.status ?? "—"}</td>
                    <td className="text-sc-delft/70">
                      {a.created_at ? new Date(a.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>

                  {open[a.id] && (
                    <tr className="bg-slate-50/60">
                      <td />
                      <td colSpan={5} className="p-3">
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="mb-2 text-xs font-medium text-sc-delft/70">
                            Users on this account
                          </div>
                          {usersByAccount[a.id]?.loading ? (
                            <div className="text-xs text-sc-delft/60">Loading users…</div>
                          ) : usersByAccount[a.id]?.error ? (
                            <div className="text-xs text-red-600">{usersByAccount[a.id]?.error}</div>
                          ) : (usersByAccount[a.id]?.rows?.length ?? 0) === 0 ? (
                            <div className="text-xs text-sc-delft/60">No users found</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-sc-delft/60">
                                  <th className="py-1">Email</th>
                                  <th>Role</th>
                                  <th>Joined</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {usersByAccount[a.id]?.rows.map((u) => (
                                  <tr key={u.id}>
                                    <td className="py-1">{u.email ?? "—"}</td>
                                    <td className="text-sc-delft/80">{u.role ?? "—"}</td>
                                    <td className="text-sc-delft/70">
                                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sc-delft/60">
                    No accounts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
