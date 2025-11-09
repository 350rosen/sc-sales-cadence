import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
});


export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const {
      stripeCustomerId,           // required: "cus_..."
      amountUsd,                  // required: number in dollars (e.g., 96)
      description,                // optional: invoice description
      lineDescription,            // optional: line item description (defaults to description)
      daysUntilDue = 30,
      currency = 'usd',           // optional, default USD
      metadata = {},
    } = req.body || {};

    if (!stripeCustomerId || !amountUsd) {
      return res.status(400).json({ error: 'stripeCustomerId and amountUsd are required' });
    }

    const cents = Math.round(Number(amountUsd) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      return res.status(400).json({ error: 'amountUsd must be a positive number' });
    }

    // 1) Create a DRAFT invoice
    const draft = await stripe.invoices.create({
      customer: stripeCustomerId,
      collection_method: 'send_invoice', // manual send flow
      days_until_due: daysUntilDue,
      auto_advance: false,               // don't auto-finalize
      description: description || undefined, // invoice-level description (shows on invoice)
      metadata,
    });

    // 2) Attach the line item TO THIS INVOICE
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: draft.id,                 // <-- key line: attach to this invoice
      amount: cents,
      currency: String(currency || 'usd').toLowerCase(),
      description: lineDescription || description || 'Sales Cadence Deal',
      metadata,
    });

    // 3) Finalize -> becomes OPEN (ready but NOT sent)
    const invoice = await stripe.invoices.finalizeInvoice(draft.id, { auto_advance: false });

    res.status(200).json({
      id: invoice.id,
      number: invoice.number,                       // now assigned
      hosted_invoice_url: invoice.hosted_invoice_url,
      dashboard_url: `https://dashboard.stripe.com/invoices/${invoice.id}`,
      status: invoice.status,                       // 'open'
      total: invoice.total,                         // in cents
      currency: invoice.currency,
    });
  } catch (e: any) {
    console.error('Invoice create error', e);
    res.status(500).json({ error: e?.message || 'Invoice creation failed' });
  }
}
