import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { to, subject, templateKey, intro, attachmentPath, context } = req.body || {};
    if (!to?.length || !subject || !templateKey) return res.status(400).json({ error: "Missing fields" });

    const html = renderTemplate(templateKey, { ...(context || {}), intro });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
    });

    const attachments = attachmentPath
      ? [{ filename: path.basename(attachmentPath), path: path.join(process.cwd(), "public", attachmentPath.replace(/^\/+/, "")) }]
      : [];

    await transporter.sendMail({
      from: `Dan Rosen <${process.env.GMAIL_USER}>`, // ← FROM = dan.rosen@getsuncaddy.com
      replyTo: `Dan Rosen <${process.env.GMAIL_USER}>`,
      to: to.map((t: any) => t.email ?? t),
      subject,
      html,
      attachments,
    });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("Gmail send failed:", e);
    return res.status(500).json({ error: e.message || "Send failed" });
  }
}

function renderTemplate(key: string, ctx: any) {
  const greet = `Hi ${ctx.contactName || "there"},`;
  const body = ctx.intro || "";
  const sign = `<br/><br/>Cheers,<br/>${ctx.repName || "Dan"}`;
  if (key === "intro_onepager") return `<p>${greet}</p><p>${body}</p><p>Attached is our one-pager.</p>${sign}`;
  return `<p>${greet}</p><p>${body}</p>${sign}`;
}
