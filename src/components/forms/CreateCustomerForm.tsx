import { useState } from "react";
import { Button, Card } from "../ui";

/**
 * Creates a Stripe customer via /api/stripe/customers (POST).
 * Required: Company Name, Company Email.
 * Optional: Primary Contact (name/title/phone), Billing Contact & Address (if different), Shipping.
 */
export default function CreateCustomerForm({ onDone }: { onDone?: () => void }) {
  // Company
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [description, setDescription] = useState("");
  const [taxStatus, setTaxStatus] = useState<"none" | "exempt">("none");

  // Optional primary contact
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactTitle, setPrimaryContactTitle] = useState("");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");

  // Billing contact (if different) + email override
  const [billingContactDifferent, setBillingContactDifferent] = useState(false);
  const [billingContactName, setBillingContactName] = useState("");
  const [billingContactEmail, setBillingContactEmail] = useState(""); // sent as billingEmail
  const [billingContactPhone, setBillingContactPhone] = useState("");

  // Billing Address (if billing contact different)
  const [billingAddress, setBillingAddress] = useState({
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "US",
  });

  // Shipping (toggle)
  const [addShipping, setAddShipping] = useState(false);
  const [shipping, setShipping] = useState({
    name: "",
    phone: "",
    address: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "US",
    },
  });

  // UI
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const inputStyle =
    "mt-1 w-full border border-sc-delft/25 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sc-green/40 focus:border-sc-green/60";
  const labelStyle = "text-sm font-medium text-sc-delft";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSuccess(false);
    setLoading(true);

    try {
      const payload: any = {
        // Map to your /api/stripe/customers fields
        name: companyName,            // company -> Stripe customer.name
        accountEmail: companyEmail,   // company email -> Stripe customer.email
        description,
        taxStatus,
      };

      // Optional primary contact in metadata (server may ignore if not merged)
      const meta: Record<string, string | undefined> = {
        primary_contact_name: primaryContactName || undefined,
        primary_contact_title: primaryContactTitle || undefined,
        primary_contact_phone: primaryContactPhone || undefined,
      };

      if (billingContactDifferent) {
        if (billingContactEmail.trim()) payload.billingEmail = billingContactEmail.trim();

        const hasBillingAddr =
          billingAddress.line1 || billingAddress.city || billingAddress.state || billingAddress.postal_code;
        if (hasBillingAddr) {
          payload.billingAddress = {
            line1: billingAddress.line1 || undefined,
            line2: billingAddress.line2 || undefined,
            city: billingAddress.city || undefined,
            state: billingAddress.state || undefined,
            postal_code: billingAddress.postal_code || undefined,
            country: billingAddress.country || "US",
          };
        }
        // also stash billing contact identity in metadata
        meta.billing_contact_name = billingContactName || undefined;
        meta.billing_contact_phone = billingContactPhone || undefined;
      }

      if (addShipping) {
        const hasShipAddr =
          shipping.address.line1 || shipping.address.city || shipping.address.state || shipping.address.postal_code;
        if (hasShipAddr || shipping.name || shipping.phone) {
          payload.shipping = {
            name: shipping.name || undefined,
            phone: shipping.phone || undefined,
            address: {
              line1: shipping.address.line1 || undefined,
              line2: shipping.address.line2 || undefined,
              city: shipping.address.city || undefined,
              state: shipping.address.state || undefined,
              postal_code: shipping.address.postal_code || undefined,
              country: shipping.address.country || "US",
            },
          };
        }
      }

      // include metadata if any keys present
      if (Object.values(meta).some(Boolean)) payload.metadata = meta;

      const res = await fetch("/api/stripe/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

      {/* Section 1: Company (required) */}
      <Card className="border border-sc-delft/20 rounded-md">
        <div className="px-4 py-3 border-b border-sc-delft/10 font-semibold text-sc-delft">
          Company
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className={labelStyle}>
            Company Name
            <input
              className={inputStyle}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              placeholder="e.g. Sunset Golf Club"
            />
          </label>

          <label className={labelStyle}>
            Company Email
            <input
              className={inputStyle}
              type="email"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
              required
              placeholder="contact@domain.com"
            />
          </label>

          <label className={`${labelStyle} md:col-span-2`}>
            Description
            <textarea
              className={`${inputStyle} resize-none`}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional note or description"
            />
          </label>
        </div>
      </Card>

      {/* Section 2: Primary Contact (optional) */}
      <Card className="border border-sc-delft/20 rounded-md">
        <div className="px-4 py-3 border-b border-sc-delft/10 font-semibold text-sc-delft">
          Primary Contact (optional)
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className={labelStyle}>
            Customer Name
            <input
              className={inputStyle}
              value={primaryContactName}
              onChange={(e) => setPrimaryContactName(e.target.value)}
              placeholder="Jane Smith"
            />
          </label>
          <label className={labelStyle}>
            Title
            <input
              className={inputStyle}
              value={primaryContactTitle}
              onChange={(e) => setPrimaryContactTitle(e.target.value)}
              placeholder="Pro Shop Manager"
            />
          </label>
          <label className={labelStyle}>
            Phone
            <input
              className={inputStyle}
              value={primaryContactPhone}
              onChange={(e) => setPrimaryContactPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </label>
        </div>
      </Card>

      {/* Section 3: Billing Contact & Address (if different) */}
      <Card className="border border-sc-delft/20 rounded-md">
        <div className="px-4 py-3 border-b border-sc-delft/10 font-semibold text-sc-delft">
          Billing Contact & Address
        </div>

        <div className="p-4">
          <label className="inline-flex items-center gap-2 text-sm text-sc-delft">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={billingContactDifferent}
              onChange={(e) => setBillingContactDifferent(e.target.checked)}
            />
            Billing contact is different?
          </label>
        </div>

        {billingContactDifferent && (
          <>
            <div className="px-4 pb-2 grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className={labelStyle}>
                Billing Contact Name
                <input
                  className={inputStyle}
                  value={billingContactName}
                  onChange={(e) => setBillingContactName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </label>
              <label className={labelStyle}>
                Billing Contact Email
                <input
                  className={inputStyle}
                  type="email"
                  value={billingContactEmail}
                  onChange={(e) => setBillingContactEmail(e.target.value)}
                  placeholder="billing@domain.com"
                />
              </label>
              <label className={labelStyle}>
                Billing Contact Phone
                <input
                  className={inputStyle}
                  value={billingContactPhone}
                  onChange={(e) => setBillingContactPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </label>
            </div>

            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className={labelStyle}>
                Address Line 1
                <input
                  className={inputStyle}
                  value={billingAddress.line1}
                  onChange={(e) => setBillingAddress({ ...billingAddress, line1: e.target.value })}
                />
              </label>
              <label className={labelStyle}>
                Address Line 2
                <input
                  className={inputStyle}
                  value={billingAddress.line2}
                  onChange={(e) => setBillingAddress({ ...billingAddress, line2: e.target.value })}
                />
              </label>
              <label className={labelStyle}>
                City
                <input
                  className={inputStyle}
                  value={billingAddress.city}
                  onChange={(e) => setBillingAddress({ ...billingAddress, city: e.target.value })}
                />
              </label>
              <label className={labelStyle}>
                State / Province
                <input
                  className={inputStyle}
                  value={billingAddress.state}
                  onChange={(e) => setBillingAddress({ ...billingAddress, state: e.target.value })}
                />
              </label>
              <label className={labelStyle}>
                Postal Code
                <input
                  className={inputStyle}
                  value={billingAddress.postal_code}
                  onChange={(e) => setBillingAddress({ ...billingAddress, postal_code: e.target.value })}
                />
              </label>
              <label className={labelStyle}>
                Country
                <input
                  className={inputStyle}
                  value={billingAddress.country}
                  onChange={(e) => setBillingAddress({ ...billingAddress, country: e.target.value })}
                  placeholder="US"
                />
              </label>
            </div>
          </>
        )}
      </Card>

      {/* Section 4: Shipping (optional) */}
      <Card className="border border-sc-delft/20 rounded-md">
        <div className="px-4 py-3 border-b border-sc-delft/10 font-semibold text-sc-delft">
          Shipping (optional)
        </div>

        <div className="p-4">
          <label className="inline-flex items-center gap-2 text-sm text-sc-delft">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={addShipping}
              onChange={(e) => setAddShipping(e.target.checked)}
            />
            Add shipping address
          </label>
        </div>

        {addShipping && (
          <>
            <div className="px-4 pb-2 grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className={labelStyle}>
                Shipping Contact Name
                <input
                  className={inputStyle}
                  value={shipping.name}
                  onChange={(e) => setShipping({ ...shipping, name: e.target.value })}
                />
              </label>
              <label className={labelStyle}>
                Phone
                <input
                  className={inputStyle}
                  value={shipping.phone}
                  onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}
                />
              </label>
              <div />
            </div>

            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className={labelStyle}>
                Address Line 1
                <input
                  className={inputStyle}
                  value={shipping.address.line1}
                  onChange={(e) => setShipping({ ...shipping, address: { ...shipping.address, line1: e.target.value } })}
                />
              </label>
              <label className={labelStyle}>
                Address Line 2
                <input
                  className={inputStyle}
                  value={shipping.address.line2}
                  onChange={(e) => setShipping({ ...shipping, address: { ...shipping.address, line2: e.target.value } })}
                />
              </label>
              <label className={labelStyle}>
                City
                <input
                  className={inputStyle}
                  value={shipping.address.city}
                  onChange={(e) => setShipping({ ...shipping, address: { ...shipping.address, city: e.target.value } })}
                />
              </label>
              <label className={labelStyle}>
                State / Province
                <input
                  className={inputStyle}
                  value={shipping.address.state}
                  onChange={(e) => setShipping({ ...shipping, address: { ...shipping.address, state: e.target.value } })}
                />
              </label>
              <label className={labelStyle}>
                Postal Code
                <input
                  className={inputStyle}
                  value={shipping.address.postal_code}
                  onChange={(e) =>
                    setShipping({ ...shipping, address: { ...shipping.address, postal_code: e.target.value } })
                  }
                />
              </label>
              <label className={labelStyle}>
                Country
                <input
                  className={inputStyle}
                  value={shipping.address.country}
                  onChange={(e) => setShipping({ ...shipping, address: { ...shipping.address, country: e.target.value } })}
                  placeholder="US"
                />
              </label>
            </div>
          </>
        )}
      </Card>

      {/* Submit */}
      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating…" : "Create Customer"}
        </Button>
      </div>
    </form>
  );
}
