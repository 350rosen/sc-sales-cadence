import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20"
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const q = req.query.q?.toString() || "";

    const results = await stripe.customers.search({
      query: q ? `name~'${q}' OR email~'${q}'` : `created>0`,
      limit: 10,
    });

    return res.status(200).json(results.data);
  }

  if (req.method === "POST") {
    const { name, email } = req.body;
    const customer = await stripe.customers.create({ name, email });
    return res.status(200).json(customer);
  }

  res.status(405).json({ error: "Method not allowed" });
}
