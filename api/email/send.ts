import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";

/* ---------- helpers ---------- */
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

async function fetchPublicAttachment(attachmentPath?: string) {
  if (!attachmentPath) return undefined;

  try {
    const rel = attachmentPath.startsWith("/") ? attachmentPath : `/${attachmentPath}`;
    const base = process.env.PUBLIC_BASE_URL || "http://localhost:3000"; // MUST be set in prod
    const url = new URL(rel, base).toString();

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const filename = rel.split("/").pop() || "attachment.bin";
    return [{ filename, content: buf }] as { filename: string; content: Buffer }[];
  } catch (e) {
    // Don’t crash the send if attachment fetch fails—just send without it.
    console.warn("Attachment fetch failed:", (e as any)?.message);
    return undefined;
  }
}

/* ---------- handler ---------- */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { to, subject, templateKey, intro, attachmentPath, context } = req.body || {};
    if (!Array.isArray(to) || to.length === 0) return res.status(400).json({ error: "Missing recipients" });
    if (!subject || !templateKey) return res.status(400).json({ error: "Missing subject/template" });

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_PASS;
    if (!user || !pass) {
      return res.status(500).json({ error: "Missing GMAIL_USER or GMAIL_PASS env vars" });
    }

    const html = renderTemplate(templateKey, { ...(context || {}), intro });
    const attachments = await fetchPublicAttachment(attachmentPath);

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
    // Surface the useful nodemailer bits for debugging
    const details = {
      message: err?.message,
      code: err?.code,
      command: err?.command,
      response: err?.response,
      responseCode: err?.responseCode,
    };
    console.error("email/send failed:", details);
    return res.status(500).json({ error: "Send failed", details });
  }
}
