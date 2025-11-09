import { useState } from "react";
import { Button } from "../ui";

export type NewStripeCustomer = {
  id: string;
  name: string;
  email?: string | null;
};

type Props = {
  defaultName?: string;
  defaultEmail?: string;
  onCancel?: () => void;
  onCreated?: (cust: NewStripeCustomer) => void;
  onDone?: () => void; // optional, kept for backward-compat
};

export default function CreateCustomerForm({
  defaultName = "",
  defaultEmail = "",
  onCancel,
  onCreated,
  onDone,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleCreate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/stripe/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name?.trim() || "New Customer",
          email: email?.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Stripe customer create failed (${res.status})`);
      }

      const resp = await res.json();
      const created: NewStripeCustomer = {
        id: resp.id,
        name: resp.name ?? name ?? "New Customer",
        email: resp.email ?? email ?? null,
      };

      onCreated?.(created);
      onDone?.();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create customer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded p-3 space-y-3">
      <div className="text-sm font-medium">Create Stripe customer</div>

      <label className="block text-sm">
        Name
        <input
          className="mt-1 w-full border rounded px-2 py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Customer name"
        />
      </label>

      <label className="block text-sm">
        Account email
        <input
          className="mt-1 w-full border rounded px-2 py-1"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
        />
      </label>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="flex gap-2">
        <Button onClick={handleCreate} disabled={busy}>
          {busy ? "Creating…" : "Create"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
