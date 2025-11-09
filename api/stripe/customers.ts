// /api/stripe/customers.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
});

function esc(q: string) {
  return q.replace(/'/g, "\\'");
}

function toLite(c: Stripe.Customer) {
  return { id: c.id, name: c.name ?? '', email: c.email ?? '' };
}

function isDeletedCustomer(c: Stripe.Customer | Stripe.DeletedCustomer): c is Stripe.DeletedCustomer {
  return (c as any).deleted === true;
}

function parseCsv(q: string | string[] | undefined): string[] {
  if (!q) return [];
  const s = Array.isArray(q) ? q.join(',') : q;
  return s
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // ---- GET full customer by id (optionally rich/raw) ----
    if (req.method === 'GET' && req.query.id) {
      const id = String(req.query.id);

      // flags
      const raw = String(req.query.raw ?? '') === '1';
      const rich = String(req.query.rich ?? '') === '1';

      // expand handling
      const userExpand = parseCsv(req.query.expand);
      const richExpand = [
        'invoice_settings.default_payment_method',
        'tax_ids',
        'discount',
        'cash_balance',
        'subscriptions', // gives subscription collection summary (not full expand on items)
      ];
      const expand = [...new Set([...(rich ? richExpand : []), ...userExpand])];

      const cust = await stripe.customers.retrieve(id, expand.length ? { expand } : undefined);

      if (isDeletedCustomer(cust)) {
        return res.status(404).json({ error: 'Customer deleted' });
      }

      if (raw) {
        // Return Stripe customer object verbatim
        return res.status(200).json(cust);
      }

      // Shape a high-signal response for UI
      const pm = cust.invoice_settings?.default_payment_method as Stripe.PaymentMethod | null | undefined;
      const billing = pm && typeof pm === 'object' && 'billing_details' in pm ? pm.billing_details : null;

      // Optional summaries
      const taxIds = (cust as any).tax_ids?.data as Array<{ id: string; type: string; value: string }> | undefined;
      const discount = (cust as any).discount as Stripe.Discount | undefined;
      const cashBalance = (cust as any).cash_balance as Stripe.CashBalance | undefined;
      const subs = (cust as any).subscriptions as Stripe.ApiList<Stripe.Subscription> | undefined;

      return res.status(200).json({
        id: cust.id,
        livemode: cust.livemode,
        created: cust.created,
        name: cust.name ?? '',
        email: cust.email ?? '',
        phone: cust.phone ?? '',
        description: cust.description ?? '',
        address: cust.address ?? null,     // { line1, line2, city, state, postal_code, country }
        shipping: cust.shipping ?? null,   // { name, phone, address }

        // Billing prefs
        invoice_settings: {
          default_payment_method: pm && typeof pm === 'object'
            ? {
                id: pm.id,
                type: pm.type,
                card: pm.card
                  ? {
                      brand: pm.card.brand,
                      last4: pm.card.last4,
                      exp_month: pm.card.exp_month,
                      exp_year: pm.card.exp_year,
                    }
                  : null,
              }
            : null,
          // common add-ons — include if you want:
          invoice_prefix: (cust as any).invoice_prefix ?? null,
          next_invoice_sequence: (cust as any).next_invoice_sequence ?? null,
        },

        preferred_locales: cust.preferred_locales ?? [],
        tax_exempt: cust.tax_exempt, // 'none' | 'exempt' | 'reverse'
        tax_ids: taxIds?.map(t => ({ id: t.id, type: t.type, value: t.value })) ?? [],

        discount: discount
          ? {
              coupon: discount.coupon
                ? {
                    id: (discount.coupon as any).id,
                    name: (discount.coupon as any).name ?? null,
                    percent_off: (discount.coupon as any).percent_off ?? null,
                    amount_off: (discount.coupon as any).amount_off ?? null,
                    duration: (discount.coupon as any).duration ?? null,
                  }
                : null,
            }
          : null,

        cash_balance: cashBalance
          ? {
              settings: {
                reconciliation_mode: cashBalance.settings?.reconciliation_mode ?? null,
              },
            }
          : null,

        // Very light subscription summary (count + a few key fields)
        subscriptions: subs
          ? {
              total_count: subs.total_count ?? subs.data?.length ?? 0,
              data: subs.data?.slice(0, 10).map(s => ({
                id: s.id,
                status: s.status,
                current_period_end: s.current_period_end,
                current_period_start: s.current_period_start,
                collection_method: s.collection_method,
              })) ?? [],
            }
          : { total_count: 0, data: [] },

        metadata: cust.metadata ?? {},
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
        `email:'${e}' OR email:'${e}*'`,
        `name:'${e}' OR name:'${e}*'`,
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
      // { name?, accountEmail?, description?, currency?, taxStatus?, billingEmail?, billingAddress?, shipping? }
      const {
        name,
        accountEmail,
        description,
        currency,       // NOTE: Stripe Customer does NOT have a currency field
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
        // currency: (currency || 'usd').toLowerCase(), // <-- not valid for customers
        tax_exempt,
        address: billingAddress || undefined,
        shipping: shipping || undefined,
        metadata: {},
      };

      if (billingEmail && billingEmail !== accountEmail) {
        (params.metadata as any).billing_email = billingEmail;
      }

      const c = await stripe.customers.create(params);
      return res.status(200).json(toLite(c));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e?.message || 'Stripe error' });
  }
}
