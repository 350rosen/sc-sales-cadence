import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { to, subject, intro, context } = req.body || {};
    if (!Array.isArray(to) || to.length === 0) return res.status(400).json({ error: "Missing recipients" });
    if (!subject) return res.status(400).json({ error: "Missing subject" });

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_PASS;
    if (!user || !pass) {
      return res.status(500).json({ error: "Missing GMAIL_USER or GMAIL_PASS env vars" });
    }

    const html = `<p>Hi ${context?.contactName || "there"},</p><p>${intro || "Test"}</p><p>— ${context?.repName || "Dan"}</p>`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    // This will surface auth/connection errors before send
    await transporter.verify();

    const info = await transporter.sendMail({
      from: `Dan Rosen <${user}>`,
      to: to.map((t: any) => (t?.email ? t.email : t)),
      subject,
      html,
    });

    return res.status(200).json({ ok: true, messageId: info.messageId });
  } catch (err: any) {
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
