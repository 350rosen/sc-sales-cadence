import { useState } from "react";
import { Button, Input, Select, Card } from "../ui";

/**
 * Creates a Stripe customer via /api/stripe/customers (POST).
 * Styling mirrors the Deal form: bordered sections + header rows.
 */
export default function CreateCustomerForm({ onDone }: { onDone?: () => void }) {
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

      setSuccess(true);
      onDone?.();
    } catch (e: any) {
      setErr(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {err && <div className="text-sm text-red-600">Error: {err}</div>}
      {success && <div className="text-sm text-green-600">Customer created successfully.</div>}

      <Card className="border border-sc-delft/20 rounded-md">
        <div className="px-4 py-3 border-b border-sc-delft/10 font-semibold text-sc-delft">
          Customer Info
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm">
            Customer Name
            <Input className="mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>

          <label className="text-sm">
            Account Email
            <Input className="mt-1 w-full" type="email" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} required />
          </label>

          <label className="text-sm md:col-span-2">
            Description
            <Input className="mt-1 w-full" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
      </Card>

      <Card className="border border-sc-delft/20 rounded-md">
        <div className="px-4 py-3 border-b border-sc-delft/10 font-semibold text-sc-delft">
          Billing & Tax
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm">
            Billing Email (optional)
            <Input className="mt-1 w-full" type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} />
          </label>

          <label className="text-sm">
            Tax Status
            <Select className="mt-1 w-full" value={taxStatus} onChange={(e) => setTaxStatus(e.target.value as "none" | "exempt")}>
              <option value="none">Taxable (None)</option>
              <option value="exempt">Exempt</option>
            </Select>
          </label>
        </div>
        <div className="px-4 pb-4 flex justify-end">
          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create Customer"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
