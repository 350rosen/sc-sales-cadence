import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

function esc(q: string) {
  return q.replace(/'/g, "\\'");
}

function toLite(c: Stripe.Customer) {
  return { id: c.id, name: c.name ?? '', email: c.email ?? '' };
}

function isDeletedCustomer(c: Stripe.Customer | Stripe.DeletedCustomer): c is Stripe.DeletedCustomer {
  return (c as any).deleted === true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // ---- GET full customer by id (with billing details) ----
    if (req.method === 'GET' && req.query.id) {
      const id = String(req.query.id);

      const cust = await stripe.customers.retrieve(id, {
        expand: ['invoice_settings.default_payment_method'],
      });

      if (isDeletedCustomer(cust)) {
        return res.status(404).json({ error: 'Customer deleted' });
      }

      const pm = cust.invoice_settings?.default_payment_method as Stripe.PaymentMethod | null | undefined;
      const billing = pm && typeof pm === 'object' && 'billing_details' in pm ? pm.billing_details : null;

      return res.status(200).json({
        id: cust.id,
        name: cust.name ?? '',
        email: cust.email ?? '',
        phone: cust.phone ?? '',
        address: cust.address ?? null,      // { city, state, ... }
        shipping: cust.shipping ?? null,    // { name, phone, address }
        billing_details: billing
          ? {
              name: billing.name ?? '',
              email: billing.email ?? '',
              phone: billing.phone ?? '',
              address: billing.address ?? null,
            }
          : null,
      });
    }

    // ---- GET search/list customers (lite) ----
    if (req.method === 'GET') {
      const q = ((req.query.q as string) || '').trim();

      if (!q) {
        const list = await stripe.customers.list({ limit: 10 });
        return res.status(200).json(list.data.map(toLite));
      }

      const e = esc(q);
      const queries = [
        // email exact or prefix
        `email:'${e}' OR email:'${e}*'`,
        // name exact or prefix
        `name:'${e}' OR name:'${e}*'`,
        // fuzzy contains-ish
        `name~'${e}' OR email~'${e}'`,
      ];

      let hits: Stripe.Customer[] = [];
      for (const query of queries) {
        const r = await stripe.customers.search({ query, limit: 10 });
        if (r.data.length) { hits = r.data; break; }
      }

      if (!hits.length) {
        // Fallback when search isn't indexed yet
        const list = await stripe.customers.list({ limit: 50 });
        const lc = q.toLowerCase();
        hits = list.data.filter(c =>
          (c.name ?? '').toLowerCase().includes(lc) ||
          (c.email ?? '').toLowerCase().includes(lc)
        ).slice(0, 10);
      }

      return res.status(200).json(hits.map(toLite));
    }

    // ---- POST create customer (lite output) ----
    if (req.method === 'POST') {
      // Expected body:
      // {
      //   name?: string,
      //   accountEmail?: string,
      //   description?: string,
      //   currency?: string,              // e.g. "usd"
      //   taxStatus?: "taxable" | "exempt",
      //   billingEmail?: string,
      //   billingAddress?: {
      //     line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string;
      //   },
      //   shipping?: {
      //     name?: string; phone?: string;
      //     address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string; }
      //   }
      // }

      const {
        name,
        accountEmail,
        description,
        currency,
        taxStatus,
        billingEmail,
        billingAddress,
        shipping,
      } = (req.body || {}) as any;

      const tax_exempt: Stripe.CustomerCreateParams.TaxExempt =
        taxStatus === 'exempt' ? 'exempt' : 'none'; // 'taxable' -> 'none'

      const params: Stripe.CustomerCreateParams = {
        name: name || 'New Customer',
        email: accountEmail || undefined,
        description: description || undefined,
        currency: (currency || 'usd').toLowerCase(),
        tax_exempt,
        // Customer "billing address" is just `address` on the customer
        address: billingAddress || undefined,
        // Customer shipping (optional)
        shipping: shipping || undefined,
        metadata: {},
      };

      // Persist a distinct billing email (Stripe has only one customer.email)
      if (billingEmail && billingEmail !== accountEmail) {
        (params.metadata as any).billing_email = billingEmail;
      }

      const c = await stripe.customers.create(params);
      return res.status(200).json(toLite(c));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Stripe error' });
  }
}
