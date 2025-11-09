import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Button, Input, Select } from "../ui";

/**
 * A lightweight customer creation form used inside the Communications page.
 * Calls /api/stripe/customers (POST) to create a new Stripe + local record.
 */
export default function CreateCustomerForm({
  onDone,
}: {
  onDone?: () => void;
}) {
  const [name, setName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [description, setDescription] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [taxStatus, setTaxStatus] = useState<"none" | "exempt">("none");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSuccess(false);
    setLoading(true);

    try {
      const res = await fetch("/api/stripe/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          accountEmail,
          description,
          billingEmail,
          taxStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create");

      // Optionally insert into your own Supabase companies table
      await supabase.from("companies").insert({
        id: data.id, // stripe id
        name: data.name,
        email: data.email,
      });

      setSuccess(true);
      if (onDone) onDone();
    } catch (e: any) {
      setErr(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {err && <div className="text-sm text-red-600">Error: {err}</div>}
      {success && (
        <div className="text-sm text-green-600">Customer created successfully.</div>
      )}

      <label className="block text-sm">
        Customer Name
        <Input
          className="mt-1 w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>

      <label className="block text-sm">
        Account Email
        <Input
          className="mt-1 w-full"
          type="email"
          value={accountEmail}
          onChange={(e) => setAccountEmail(e.target.value)}
          required
        />
      </label>

      <label className="block text-sm">
        Description
        <Input
          className="mt-1 w-full"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        Billing Email (optional)
        <Input
          className="mt-1 w-full"
          type="email"
          value={billingEmail}
          onChange={(e) => setBillingEmail(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        Tax Status
        <Select
          className="mt-1 w-full"
          value={taxStatus}
          onChange={(e) =>
            setTaxStatus(e.target.value as "none" | "exempt")
          }
        >
          <option value="none">Taxable (None)</option>
          <option value="exempt">Exempt</option>
        </Select>
      </label>

      <div className="pt-3 flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating…" : "Create Customer"}
        </Button>
      </div>
    </form>
  );
}
