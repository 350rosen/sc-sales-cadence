import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { PageHeader, Card, Button, Select, Input } from "../components/ui";
import Modal from "../components/forms/Modal";
import CreateCustomerForm from "../components/forms/CreateCustomerForm";
import { useRole } from "../services/useRole";


/* ---------------- Types ---------------- */
type CustomerLite = { id: string; name: string; email?: string | null };
type Contact = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
};

/* ---------------- Email choices ---------------- */
const EMAIL_TEMPLATES = [
  { key: "intro_onepager", label: "Intro + One-Pager" },
  { key: "intro_pricing", label: "Intro + Pricing Overview" },
  { key: "intro_followup", label: "Intro + Quick Follow-Up" },
];

const ATTACHMENTS = [
  { key: "one-pager", label: "One-Pager (PDF)", file: "/attachments/onepager.pdf" },
  { key: "sell-sheet", label: "Sell Sheet (PDF)", file: "/attachments/sell-sheet.pdf" },
];

/* ---------------- Component ---------------- */
export default function Communications() {
  const { profile, loading: roleLoading } = useRole();
  const repName = (profile?.full_name || "").trim();

  // data
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  // selections
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedContactId, setSelectedContactId] = useState<number | "new" | "">("");
  const [newContact, setNewContact] = useState<Partial<Contact>>({ name: "", email: "", phone: "" });

  // email content
  const [templateKey, setTemplateKey] = useState<string>(EMAIL_TEMPLATES[0].key);
  const [attachmentKey, setAttachmentKey] = useState<string>(ATTACHMENTS[0].key);
  const [subject, setSubject] = useState<string>("Quick intro from Sun Caddy");
  const [intro, setIntro] = useState<string>(
    "Hi there — wanted to share a quick intro and one-pager. Happy to connect!"
  );

  // ui state
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentOk, setSentOk] = useState(false);
  const [openCreateCustomer, setOpenCreateCustomer] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find(c => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );
  const selectedContact = useMemo(
    () => (typeof selectedContactId === "number" ? contacts.find(c => c.id === selectedContactId) || null : null),
    [contacts, selectedContactId]
  );

  const canSend = useMemo(() => {
    if (!repName) return false;
    const email = selectedContact?.email || newContact.email;
    const name = selectedContact?.name || newContact.name;
    return !!selectedCustomerId && !!email && !!name && !!subject && !!templateKey && !!attachmentKey && !sending;
  }, [repName, selectedCustomerId, selectedContact, newContact, subject, templateKey, attachmentKey, sending]);

  /* -------- Load Stripe customers (top 10; simple) -------- */
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch("/api/stripe/customers");
        const data: CustomerLite[] = await res.json();
        if (!cancel) setCustomers(data || []);
      } catch (e) {
        if (!cancel) setErr("Failed to load Stripe customers.");
      }
    })();
    return () => { cancel = true; };
  }, []);

  /* -------- Load/Filter contacts by selected customer (Stripe customer_id) -------- */
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("contacts")
          .select("id,name,email,phone,customer_id,customer_name")
          .order("name", { ascending: true });

        if (error) throw new Error(error.message);
        if (cancel) return;

        const all = (data ?? []) as Contact[];
        const filtered = selectedCustomerId
          ? all.filter(c => String(c.customer_id) === String(selectedCustomerId))
          : all;

        setContacts(filtered);
      } catch (e: any) {
        if (!cancel) setErr(e?.message || "Failed to load contacts");
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
      // ensure contact exists if "new"
      let contactId = typeof selectedContactId === "number" ? selectedContactId : null;
      let contactName = selectedContact?.name || newContact.name || "";
      let contactEmail = selectedContact?.email || newContact.email || "";
      let contactPhone = selectedContact?.phone || newContact.phone || null;

      if (selectedContactId === "new") {
        const { data, error } = await supabase
          .from("contacts")
          .insert({
            name: contactName,
            email: contactEmail,
            phone: contactPhone,
            customer_id: selectedCustomerId,               // Stripe id
            customer_name: selectedCustomer?.name ?? null,
          })
          .select("id")
          .single();

        if (error) throw new Error(error.message);
        contactId = data?.id ?? null;
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
        context: {
          contactName,
          customerName: selectedCustomer?.name ?? "",
          repName,
        },
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
        contact_id: contactId,
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
          <Button onClick={() => setOpenCreateCustomer(true)}>Create Customer</Button>
        </div>
      }
    />
      <Card className="p-3 text-sm text-sc-delft/70">
        {roleLoading ? "Loading role…" : <>Signed in as <b>{repName || "—"}</b>. Send intros and track outbound emails (pre-deal).</>}
      </Card>

      {err && <div className="text-sm text-red-600">Error: {err}</div>}
      {sentOk && <div className="text-sm text-green-700">Email sent and logged.</div>}

      {/* ---- Section: Recipient ---- */}
      <Card className="border border-sc-delft/20 rounded-md">
        <div className="px-4 py-3 border-b border-sc-delft/10 font-semibold text-sc-delft">Recipient</div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Customer */}
          <label className="text-sm block">
            Customer
            <Select
              className="mt-1 w-full"
              value={selectedCustomerId}
              onChange={(e: any) => {
                setSelectedCustomerId(e.target.value);
                setSelectedContactId("");
              }}
            >
              <option value="">Select customer…</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </label>

          {/* Contact */}
          <label className="text-sm block">
            Contact
            <Select
              className="mt-1 w-full"
              value={String(selectedContactId)}
              onChange={(e: any) => {
                const v = e.target.value;
                setSelectedContactId(v === "new" ? "new" : v ? Number(v) : "");
              }}
              disabled={!selectedCustomerId}
            >
              <option value="">Select contact…</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
              ))}
              <option value="new">+ Add new contact</option>
            </Select>
          </label>
        </div>

        {selectedContactId === "new" && (
          <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="text-sm">
              Contact Name
              <Input className="mt-1 w-full" value={newContact.name || ""} onChange={(e:any)=>setNewContact(s=>({...s, name: e.target.value}))}/>
            </label>
            <label className="text-sm">
              Email
              <Input className="mt-1 w-full" type="email" value={newContact.email || ""} onChange={(e:any)=>setNewContact(s=>({...s, email: e.target.value}))}/>
            </label>
            <label className="text-sm">
              Phone
              <Input className="mt-1 w-full" value={newContact.phone || ""} onChange={(e:any)=>setNewContact(s=>({...s, phone: e.target.value}))}/>
            </label>
          </div>
        )}
      </Card>

      {/* ---- Section: Email Details ---- */}
      <Card className="border border-sc-delft/20 rounded-md">
        <div className="px-4 py-3 border-b border-sc-delft/10 font-semibold text-sc-delft">Email</div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-sm">
            Template
            <Select className="mt-1 w-full" value={templateKey} onChange={(e:any)=>setTemplateKey(e.target.value)}>
              {EMAIL_TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </label>
          <label className="text-sm">
            Attachment
            <Select className="mt-1 w-full" value={attachmentKey} onChange={(e:any)=>setAttachmentKey(e.target.value)}>
              {ATTACHMENTS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </Select>
          </label>
          <label className="text-sm">
            Subject
            <Input className="mt-1 w-full" value={subject} onChange={(e:any)=>setSubject(e.target.value)} />
          </label>
        </div>

        <div className="px-4 pb-4">
          <label className="text-sm block">
            Intro Message
            <textarea
              className="mt-1 w-full border rounded px-2 py-2 text-sm"
              rows={6}
              value={intro}
              onChange={(e:any)=>setIntro(e.target.value)}
            />
          </label>
        </div>

        <div className="px-4 pb-4 flex justify-end">
          <Button disabled={!canSend} onClick={handleSend}>
            {sending ? "Sending…" : "Send Email"}
          </Button>
        </div>
      </Card>

      {/* ---- Modal: Create Customer ---- */}
      <Modal open={openCreateCustomer} title="Create Customer" onClose={() => setOpenCreateCustomer(false)}>
        <CreateCustomerForm
          onDone={async () => {
            setOpenCreateCustomer(false);
            // refresh Stripe list after creation
            const res = await fetch("/api/stripe/customers");
            const data: CustomerLite[] = await res.json();
            setCustomers(data || []);
          }}
        />
      </Modal>
    </section>
  );
}
