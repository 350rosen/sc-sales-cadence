import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Button } from "../ui";

type Props = { onDone: () => void };

export default function AddDealExtendedForm({ onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    // deal
    name: "",
    city: "",
    state: "",
    account_rep: "",
    value: "",
    stage: "unpaid" as "paid" | "unpaid",
    close_date: "",

    // main contact
    main_contact: "",
    main_contact_title: "",
    main_contact_email: "",
    main_contact_phone: "",

    // billing contact
    billing_contact_name: "",
    billing_contact_title: "",
    billing_contact_email: "",
    billing_contact_phone: "",
  });

  const handle = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  async function submit() {
    setBusy(true);
    setErr(null);

    const payload = {
      name: form.name || null,
      city: form.city || null,
      state: form.state || null,
      account_rep: form.account_rep || null,
      value: form.value ? Number(form.value) : null,
      stage: form.stage || null,
      close_date: form.close_date || null,

      main_contact: form.main_contact || null,
      main_contact_title: form.main_contact_title || null,
      main_contact_email: form.main_contact_email || null,
      main_contact_phone: form.main_contact_phone || null,

      billing_contact_name: form.billing_contact_name || null,
      billing_contact_title: form.billing_contact_title || null,
      billing_contact_email: form.billing_contact_email || null,
      billing_contact_phone: form.billing_contact_phone || null,
    };

    const { error } = await supabase.from("deals").insert(payload);
    setBusy(false);
    if (error) {
      setErr(error.message);
    } else {
      onDone();
    }
  }

  return (
    <div className="space-y-4">
      {/* Deal basics */}
      <div>
        <div className="mb-2 font-medium text-sc-delft">Deal</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Company
            <input name="name" className="mt-1 w-full border rounded px-2 py-1" value={form.name} onChange={handle}/>
          </label>
          <label className="text-sm">Rep
            <input name="account_rep" className="mt-1 w-full border rounded px-2 py-1" value={form.account_rep} onChange={handle}/>
          </label>
          <label className="text-sm">City
            <input name="city" className="mt-1 w-full border rounded px-2 py-1" value={form.city} onChange={handle}/>
          </label>
          <label className="text-sm">State
            <input name="state" className="mt-1 w-full border rounded px-2 py-1" value={form.state} onChange={handle}/>
          </label>
          <label className="text-sm">Value (USD)
            <input name="value" type="number" min="0" className="mt-1 w-full border rounded px-2 py-1" value={form.value} onChange={handle}/>
          </label>
          <label className="text-sm">Stage
            <select name="stage" className="mt-1 w-full border rounded px-2 py-1" value={form.stage} onChange={handle}>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          <label className="text-sm col-span-2">Close Date
            <input name="close_date" type="date" className="mt-1 w-full border rounded px-2 py-1" value={form.close_date} onChange={handle}/>
          </label>
        </div>
      </div>

      {/* Main contact */}
      <div>
        <div className="mb-2 font-medium text-sc-delft">Main Contact</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Name
            <input name="main_contact" className="mt-1 w-full border rounded px-2 py-1" value={form.main_contact} onChange={handle}/>
          </label>
          <label className="text-sm">Title
            <input name="main_contact_title" className="mt-1 w-full border rounded px-2 py-1" value={form.main_contact_title} onChange={handle}/>
          </label>
          <label className="text-sm">Email
            <input name="main_contact_email" type="email" className="mt-1 w-full border rounded px-2 py-1" value={form.main_contact_email} onChange={handle}/>
          </label>
          <label className="text-sm">Phone
            <input name="main_contact_phone" className="mt-1 w-full border rounded px-2 py-1" value={form.main_contact_phone} onChange={handle}/>
          </label>
        </div>
      </div>

      {/* Billing contact */}
      <div>
        <div className="mb-2 font-medium text-sc-delft">Billing Contact</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Name
            <input name="billing_contact_name" className="mt-1 w-full border rounded px-2 py-1" value={form.billing_contact_name} onChange={handle}/>
          </label>
          <label className="text-sm">Title
            <input name="billing_contact_title" className="mt-1 w-full border rounded px-2 py-1" value={form.billing_contact_title} onChange={handle}/>
          </label>
          <label className="text-sm">Email
            <input name="billing_contact_email" type="email" className="mt-1 w-full border rounded px-2 py-1" value={form.billing_contact_email} onChange={handle}/>
          </label>
          <label className="text-sm">Phone
            <input name="billing_contact_phone" className="mt-1 w-full border rounded px-2 py-1" value={form.billing_contact_phone} onChange={handle}/>
          </label>
        </div>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save Deal"}</Button>
      </div>
    </div>
  );
}
