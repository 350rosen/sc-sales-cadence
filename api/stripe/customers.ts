import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

function esc(q: string) {
  return q.replace(/'/g, "\\'");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
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

      // Fallback: list & filter (helps when search hasn’t indexed yet)
      if (!hits.length) {
        const list = await stripe.customers.list({ limit: 50 });
        const lc = q.toLowerCase();
        hits = list.data.filter(c =>
          (c.name ?? '').toLowerCase().includes(lc) ||
          (c.email ?? '').toLowerCase().includes(lc)
        ).slice(0, 10);
      }

      return res.status(200).json(hits.map(toLite));
    }

    if (req.method === 'POST') {
      const { name, email } = (req.body || {}) as { name?: string; email?: string };
      const c = await stripe.customers.create({ name: name || 'New Customer', email });
      return res.status(200).json(toLite(c));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    return res.status(400).json({ error: e.message || 'Stripe error' });
  }
}

function toLite(c: Stripe.Customer) {
  return { id: c.id, name: c.name ?? '', email: c.email ?? '' };
}
