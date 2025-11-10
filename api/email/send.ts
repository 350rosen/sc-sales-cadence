import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";

/** tiny template renderer */
function renderTemplate(key: string, ctx: Record<string, any>) {
  const greeting = `Hi ${ctx.contactName || "there"},`;
  const body = ctx.intro || "";
  const signoff = `<br/><br/>Cheers,<br/>${ctx.repName || "Dan"}`;
  switch (key) {
    case "intro_onepager":
      return `<p>${greeting}</p><p>${body}</p><p>Attached is our one-pager for a quick overview.</p>${signoff}`;
    case "intro_pricing":
      return `<p>${greeting}</p><p>${body}</p><p>Attached is a brief pricing overview.</p>${signoff}`;
    case "intro_followup":
      return `<p>${greeting}</p><p>${body}</p><p>Just following up—happy to send samples or answer questions.</p>${signoff}`;
    default:
      return `<p>${greeting}</p><p>${body}</p>${signoff}`;
  }
}

/** fetches a public file (e.g., /attachments/onepager.pdf) and returns a Nodemailer attachment */
async function fetchPublicAttachment(attachmentPath?: string) {
  if (!attachmentPath) return undefined;

  // Ensure leading slash
  const rel = attachmentPath.startsWith("/") ? attachmentPath : `/${attachmentPath}`;

  // Build absolute URL to the deployed site (set this in env on Vercel)
  const base =
    process.env.PUBLIC_BASE_URL || // e.g. https://sc-sales-cadence.vercel.app
    `http://localhost:3000`;
  const url = new URL(rel, base).toString();

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch attachment: ${url} (${resp.status})`);
  const arrayBuf = await resp.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  const filename = rel.split("/").pop() || "attachment.bin";

  // Let Nodemailer infer content type from filename
  return [{ filename, content: buf }] as { filename: string; content: Buffer }[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { to, subject, templateKey, intro, attachmentPath, context } = req.body || {};
    if (!Array.isArray(to) || to.length === 0) {
      return res.status(400).json({ error: "Missing recipients" });
    }
    if (!subject || !templateKey) {
      return res.status(400).json({ error: "Missing subject/template" });
    }

    // Validate env
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_PASS;
    if (!user || !pass) {
      return res.status(500).json({ error: "Missing GMAIL_USER or GMAIL_PASS env vars" });
    }

    // Render HTML
    const html = renderTemplate(templateKey, { ...(context || {}), intro });

    // Prepare attachment (via public URL fetch so it works on Vercel)
    const attachments = await fetchPublicAttachment(attachmentPath);

    // Gmail SMTP transport
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `Dan Rosen <${user}>`,
      replyTo: `Dan Rosen <${user}>`,
      to: to.map((t: any) => (t?.email ? t.email : t)),
      subject,
      html,
      attachments,
    });

    return res.status(200).json({ ok: true, messageId: info.messageId });
  } catch (err: any) {
    // Always return JSON to avoid the "Unexpected token 'A'" parse error in the client
    console.error("email/send failed:", err);
    return res.status(500).json({ error: err?.message || "Send failed" });
  }
}
