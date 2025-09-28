import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Card, Button } from "../components/ui";

/* --------- types --------- */

type DealContactSelect = {
  id: number;
  name: string | null; // company name
  city: string | null;
  state: string | null;

  main_contact: string | null;
  main_contact_title: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;

  billing_contact_name: string | null;
  billing_contact_title: string | null;
  billing_contact_email: string | null;
  billing_contact_phone: string | null;
};

type ContactRow = {
  id: string;
  name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  type: Array<"main" | "billing">;
};

/* --------- component --------- */

export default function Contacts() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // filters
  const [typeFilter, setTypeFilter] = useState<"all" | "main" | "billing">("all");
  const [companyQuery, setCompanyQuery] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("deals")
        .select(`
          id,
          name, city, state,
          main_contact, main_contact_title, main_contact_email, main_contact_phone,
          billing_contact_name, billing_contact_title, billing_contact_email, billing_contact_phone
        `)
        .returns<DealContactSelect[]>();

      if (error) {
        console.error(error);
        setErr(error.message);
        setRows([]);
      } else {
        setRows(flattenAndCompress(data ?? []));
      }
      setLoading(false);
    })();
  }, []);

  const contacts = useMemo(() => {
    let out = [...rows];

    if (typeFilter !== "all") {
      out = out.filter((c) => c.type.includes(typeFilter));
    }

    if (companyQuery.trim()) {
      const q = companyQuery.toLowerCase();
      out = out.filter((c) => (c.company ?? "").toLowerCase().includes(q));
    }

    // sort by name
    out.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return out;
  }, [rows, typeFilter, companyQuery]);

  const resetFilters = () => {
    setTypeFilter("all");
    setCompanyQuery("");
  };

  return (
    <section className="space-y-4">

      {/* Filters */}
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | "main" | "billing")}
          className="border rounded-md px-2 py-1 text-sm"
        >
          <option value="all">All Types</option>
          <option value="main">Main</option>
          <option value="billing">Billing</option>
        </select>

        <input
          type="text"
          placeholder="Filter by company…"
          value={companyQuery}
          onChange={(e) => setCompanyQuery(e.target.value)}
          className="border rounded-md px-2 py-1 text-sm flex-1"
        />

        <Button variant="secondary" onClick={resetFilters}>
          Reset
        </Button>
      </Card>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Phone</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400">
                  No contacts found
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{c.name ?? "—"}</td>
                  <td className="px-4 py-2 text-center capitalize">{c.type.join(", ")}</td>
                  <td className="px-4 py-2 text-center">{c.title ?? "—"}</td>
                  <td className="px-4 py-2 text-center">{c.company ?? "—"}</td>
                  <td className="px-4 py-2 text-center">
                    {c.email ? (
                      <a className="text-sc-delft underline" href={`mailto:${c.email}`}>
                        {c.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">{c.phone ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

/* ---------------- helpers ---------------- */

function normalizePhone(p?: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/\D+/g, "");
  return digits || null;
}

function normalizeEmail(e?: string | null): string | null {
  if (!e) return null;
  const t = e.trim().toLowerCase();
  return t || null;
}

function normalizeName(s?: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  return t || null;
}

/**
 * Build contact rows for main & billing; then compress by:
 * 1) name + phone
 * 2) name + email
 * 3) name + company
 */
function flattenAndCompress(deals: DealContactSelect[]): ContactRow[] {
  type Keyed = ContactRow & { _key: string };

  const candidates: Keyed[] = [];

  for (const d of deals) {
    const company = normalizeName(d.name);

    // main
    if (
      d.main_contact ||
      d.main_contact_email ||
      d.main_contact_phone
    ) {
      const name = normalizeName(d.main_contact);
      const email = normalizeEmail(d.main_contact_email);
      const phone = normalizePhone(d.main_contact_phone);
      const title = d.main_contact_title ?? "Main Contact";

      candidates.push({
        _key: computeKey(name, phone, email, company),
        id: `${d.id}-main`,
        name,
        title,
        company,
        email,
        phone,
        type: ["main"],
      });
    }

    // billing
    if (
      d.billing_contact_name ||
      d.billing_contact_email ||
      d.billing_contact_phone
    ) {
      const name = normalizeName(d.billing_contact_name);
      const email = normalizeEmail(d.billing_contact_email);
      const phone = normalizePhone(d.billing_contact_phone);
      const title = d.billing_contact_title ?? "Billing Contact";

      candidates.push({
        _key: computeKey(name, phone, email, company),
        id: `${d.id}-billing`,
        name,
        title,
        company,
        email,
        phone,
        type: ["billing"],
      });
    }
  }

  // Merge by computed key
  const map = new Map<string, Keyed>();
  for (const c of candidates) {
    const k = c._key;
    if (!map.has(k)) {
      map.set(k, { ...c });
    } else {
      const ex = map.get(k)!;
      // fill missing fields
      ex.name ||= c.name;
      ex.title ||= c.title;
      ex.company ||= c.company;
      ex.email ||= c.email;
      ex.phone ||= c.phone;
      // merge types (unique)
      ex.type = Array.from(new Set([...ex.type, ...c.type])) as Array<"main" | "billing">;
    }
  }

  // Return without internal key
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return Array.from(map.values()).map(({ _key, ...rest }) => rest);
}

/** Priority key builder: name+phone > name+email > name+company */
function computeKey(
  name: string | null,
  phone: string | null,
  email: string | null,
  company: string | null
): string {
  const n = name ?? "";
  if (n && phone) return `n:${n}|p:${phone}`;
  if (n && email) return `n:${n}|e:${email}`;
  return `n:${n}|c:${company ?? ""}`;
}
