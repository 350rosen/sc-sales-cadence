import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { PageHeader, Card, Button } from "../components/ui";
import Modal from "../components/forms/Modal";
import CreateCustomerForm from "../components/forms/CreateCustomerForm";
import { useRole } from "../services/useRole";

/* ---------------- Types ---------------- */
type CustomerLite = { id: string; name: string; email?: string | null };

type Contact = {
  id: string;                       // string for both DB ids ("123") and Stripe pseudo-ids ("stripe:main:cus_...")
  name: string | null;
  email: string | null;
  phone?: string | null;
  customer_id?: string | null;      // DB only
  customer_name?: string | null;    // DB only
  source: "db" | "stripe";
};

/* ---------------- Constants ---------------- */
const EMAIL_TEMPLATES = [
  { key: "intro_onepager", label: "Intro + One-Pager" },
  { key: "intro_pricing", label: "Intro + Pricing Overview" },
  { key: "intro_followup", label: "Intro + Quick Follow-Up" },
];

const ATTACHMENTS = [
  { key: "one-pager", label: "One-Pager (PDF)", file: "/attachments/onepager.pdf" },
  { key: "sell-sheet", label: "Sell Sheet (PDF)", file: "/attachments/sell-sheet.pdf" },
];

/* ---------------- Styling helpers ---------------- */
const inputStyle =
  "mt-1 w-full border border-sc-delft/25 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sc-green/40 focus:border-sc-green/60";
const labelStyle = "text-sm font-medium text-sc-delft";

/* ---------------- Helpers ---------------- */
const compact = (s?: string | null) => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

const dedupeContacts = (items: Contact[]) => {
  const seen = new Set<string>();
  const out: Contact[] = [];
  for (const c of items) {
    const key =
      (c.email?.toLowerCase() ?? "") + "|" + (c.phone ?? "") + "|" + (c.name?.toLowerCase() ?? "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
};

const stripeToContacts = (full: any): Contact[] => {
  if (!full) return [];
  const cand: Contact[] = [];

  // 1) Main customer
  cand.push({
    id: `stripe:main:${full.id}`,
    name: compact(full.name),
    email: compact(full.email),
    phone: compact(full.phone),
    source: "stripe",
  });

  // 2) Shipping
  if (full.shipping) {
    cand.push({
      id: `stripe:ship:${full.id}`,
      name: compact(full.shipping?.name),
      email: null,
      phone: compact(full.shipping?.phone),
      source: "stripe",
    });
  }

  // 3) Billing details (if your API returns it)
  if (full.billing_details) {
    cand.push({
      id: `stripe:bill:${full.id}`,
      name: compact(full.billing_details?.name),
      email: compact(full.billing_details?.email),
      phone: compact(full.billing_details?.phone),
      source: "stripe",
    });
  }

  // 4) Default PM billing details (common place to store contact)
  const pmBill = full?.invoice_settings?.default_payment_method?.billing_details;
  if (pmBill) {
    cand.push({
      id: `stripe:pm:${full.id}`,
      name: compact(pmBill.name),
      email: compact(pmBill.email),
      phone: compact(pmBill.phone),
      source: "stripe",
    });
  }

  return dedupeContacts(cand.filter(c => c.name || c.email || c.phone));
};

/* ---------------- Component ---------------- */
export default function Communications() {
  const { profile, loading: roleLoading } = useRole();
  const repName = (profile?.full_name || "").trim();

  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedContactId, setSelectedContactId] = useState<string | "new" | "">("");
  const [newContact, setNewContact] = useState<Partial<Contact>>({ name: "", email: "", phone: "" });

  const [templateKey, setTemplateKey] = useState(EMAIL_TEMPLATES[0].key);
  const [attachmentKey, setAttachmentKey] = useState(ATTACHMENTS[0].key);
  const [subject, setSubject] = useState("Quick intro from Sun Caddy");
  const [intro, setIntro] = useState("Hi there — wanted to share a quick intro and one-pager. Happy to connect!");

  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentOk, setSentOk] = useState(false);

  const [openCreateCustomer, setOpenCreateCustomer] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find(c => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );
  const selectedContact = useMemo(
    () => contacts.find(c => c.id === selectedContactId) || null,
    [contacts, selectedContactId]
  );

  const canSend =
    !!repName &&
    !!selectedCustomerId &&
    !!(selectedContact?.email || newContact.email) &&
    !!(selectedContact?.name || newContact.name) &&
    !!subject &&
    !!templateKey &&
    !!attachmentKey &&
    !sending;

  /* -------- Load Stripe customers -------- */
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch("/api/stripe/customers");
        const data: CustomerLite[] = await res.json();
        if (!cancel) setCustomers(data || []);
      } catch {
        if (!cancel) setErr("Failed to load Stripe customers.");
      }
    })();
    return () => { cancel = true; };
  }, []);

  /* -------- Load contacts (DB + Stripe) when customer changes -------- */
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setErr(null);
        setSelectedContactId("");

        const merged: Contact[] = [];

        // A) DB contacts for this customer (communication_contacts)
        {
          const { data, error } = await supabase
            .from("communication_contacts")
            .select("id,name,email,phone,customer_id,customer_name")
            .order("name", { ascending: true });

          if (error) {
            if (error.code === "PGRST205") {
              if (!cancel) setErr("Table communication_contacts not found — create it in Supabase.");
            } else {
              throw error;
            }
          }

          const all = (data ?? []) as Array<{
            id: number; name: string | null; email: string | null; phone?: string | null;
            customer_id?: string | null; customer_name?: string | null;
          }>;

          const filtered = selectedCustomerId
            ? all.filter(c => String(c.customer_id) === String(selectedCustomerId))
            : all;

          merged.push(
            ...filtered.map(r => ({
              id: String(r.id),
              name: compact(r.name),
              email: compact(r.email),
              phone: compact(r.phone),
              customer_id: r.customer_id ?? null,
              customer_name: r.customer_name ?? null,
              source: "db" as const,
            }))
          );
        }

        // B) Stripe-derived contacts for this Stripe customer
        if (selectedCustomerId) {
          const res = await fetch(`/api/stripe/customers?id=${encodeURIComponent(selectedCustomerId)}`);
          const full = await res.json();
          merged.push(...stripeToContacts(full));
        }

        const finalList = dedupeContacts(merged).sort((a, b) => {
          const an = (a.name || a.email || "").toLowerCase();
          const bn = (b.name || b.email || "").toLowerCase();
          return an.localeCompare(bn);
        });

        if (!cancel) setContacts(finalList);
      } catch (e: any) {
        if (!cancel) setErr(e.message || "Failed to load contacts");
      }
    })();
    return () => { cancel = true; };
  }, [selectedCustomerId]);

  /* -------- Send email and log -------- */
  async function handleSend() {
    setErr(null);
    setSentOk(false);
    setSending(true);
    try {
      const chosen = selectedContact;
      const isDb = chosen?.source === "db";
      let contactIdForLog: number | null = isDb && chosen?.id ? Number(chosen.id) : null;

      const contactName = chosen?.name ?? newContact.name ?? "";
      const contactEmail = chosen?.email ?? newContact.email ?? "";
      const contactPhone = chosen?.phone ?? newContact.phone ?? null;

      if (selectedContactId === "new") {
        const { data, error } = await supabase
          .from("communication_contacts")
          .insert({
            name: contactName,
            email: contactEmail,
            phone: contactPhone,
            customer_id: selectedCustomerId,
            customer_name: selectedCustomer?.name ?? null,
          })
          .select("id")
          .single();

        if (error) throw new Error(error.message);
        contactIdForLog = data?.id ?? null;

        // add into local list and select it
        setContacts(prev => dedupeContacts([
          {
            id: String(data.id),
            name: contactName,
            email: contactEmail,
            phone: contactPhone,
            customer_id: selectedCustomerId,
            customer_name: selectedCustomer?.name ?? null,
            source: "db",
          },
          ...prev,
        ]));
        setSelectedContactId(String(data.id));
      }

      const attach = ATTACHMENTS.find(a => a.key === attachmentKey);
      const attachmentPath = attach?.file || "";

      const payload = {
        to: [{ name: contactName, email: contactEmail }],
        subject,
        templateKey,
        intro,
        attachmentKey,
        attachmentPath,
        context: { contactName, customerName: selectedCustomer?.name ?? "", repName },
      };

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      const ok = res.ok;

      await supabase.from("communications").insert({
        rep_name: repName,
        customer_id: selectedCustomerId,
        customer_name: selectedCustomer?.name ?? null,
        contact_id: contactIdForLog, // null when Stripe-only
        contact_name: contactName,
        contact_email: contactEmail,
        subject,
        template_key: templateKey,
        intro_message: intro,
        attachment_type: attachmentKey,
        status: ok ? "sent" : "failed",
        error: ok ? null : json?.error || "unknown",
      });

      if (!ok) throw new Error(json?.error || "Failed to send");
      setSentOk(true);
    } catch (e: any) {
      setErr(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  }

  /* -------- View -------- */
  return (
    <section className="space-y-4">
      <PageHeader
        title="Communications"
        cta={
          <div className="flex gap-2">
            <Button onClick={() => setOpenCreateCustomer(true)}>
              Create Customer
            </Button>
          </div>
        }
      />

      <Card className="p-3 text-sm text-sc-delft/70">
        {roleLoading
          ? "Loading profile…"
          : <>Signed in as <b>{repName || "—"}</b>. Send intros and track outbound emails.</>}
      </Card>

      {err && <div className="text-sm text-red-600">Error: {err}</div>}
      {sentOk && <div className="text-sm text-green-700">Email sent and logged.</div>}

      {/* Recipient */}
      <Card className="border border-sc-delft/20 rounded-md">
        <div className="px-4 py-3 border-b border-sc-delft/10 font-semibold text-sc-delft">
          Recipient
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className={labelStyle}>
            Customer
            <select
              className={inputStyle}
              value={selectedCustomerId}
              onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                setSelectedContactId("");
              }}
            >
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <label className={labelStyle}>
            Contact
            <select
              className={inputStyle}
              value={String(selectedContactId)}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedContactId(v === "new" ? "new" : v || "");
              }}
              disabled={!selectedCustomerId}
            >
              <option value="">Select contact…</option>

              {contacts.some(c => c.source === "db") && (
                <optgroup label="Saved in CRM">
                  {contacts.filter(c => c.source === "db").map(c => (
                    <option key={c.id} value={c.id}>
                      {(c.name || c.email || "(No name)")}{c.email ? ` — ${c.email}` : ""}{c.phone ? ` — ${c.phone}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}

              {contacts.some(c => c.source === "stripe") && (
                <optgroup label="From Stripe">
                  {contacts.filter(c => c.source === "stripe").map(c => (
                    <option key={c.id} value={c.id}>
                      {(c.name || c.email || "(No name)")}{c.email ? ` — ${c.email}` : ""}{c.phone ? ` — ${c.phone}` : ""} [Stripe]
                    </option>
                  ))}
                </optgroup>
              )}

              <option value="new">+ Add new contact</option>
            </select>
          </label>
        </div>

        {selectedContactId === "new" && (
          <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className={labelStyle}>
              Name
              <input className={inputStyle} value={newContact.name || ""} onChange={(e) => setNewContact(s => ({ ...s, name: e.target.value }))}/>
            </label>
            <label className={labelStyle}>
              Email
              <input className={inputStyle} type="email" value={newContact.email || ""} onChange={(e) => setNewContact(s => ({ ...s, email: e.target.value }))}/>
            </label>
            <label className={labelStyle}>
              Phone
              <input className={inputStyle} value={newContact.phone || ""} onChange={(e) => setNewContact(s => ({ ...s, phone: e.target.value }))}/>
            </label>
          </div>
        )}
      </Card>

      {/* Email section */}
      <Card className="border border-sc-delft/20 rounded-md">
        <div className="px-4 py-3 border-b border-sc-delft/10 font-semibold text-sc-delft">
          Email
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className={labelStyle}>
            Template
            <select className={inputStyle} value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
              {EMAIL_TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>

          <label className={labelStyle}>
            Attachment
            <select className={inputStyle} value={attachmentKey} onChange={(e) => setAttachmentKey(e.target.value)}>
              {ATTACHMENTS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </label>

          <label className={labelStyle}>
            Subject
            <input className={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
        </div>

        <div className="px-4 pb-4">
          <label className={labelStyle}>
            Intro Message
            <textarea className={`${inputStyle} resize-y`} rows={6} value={intro} onChange={(e) => setIntro(e.target.value)} />
          </label>
        </div>

        <div className="px-4 pb-4 flex justify-end">
          <Button disabled={!canSend} onClick={handleSend}>
            {sending ? "Sending…" : "Send Email"}
          </Button>
        </div>
      </Card>

      {/* Modals */}
      <Modal open={openCreateCustomer} title="Create Customer" onClose={() => setOpenCreateCustomer(false)}>
        <CreateCustomerForm
          onDone={async () => {
            setOpenCreateCustomer(false);
            const res = await fetch("/api/stripe/customers");
            const data: CustomerLite[] = await res.json();
            setCustomers(data || []);
          }}
        />
      </Modal>
    </section>
  );
}
