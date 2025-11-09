// /api/email/send.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { to, subject, templateKey, intro, attachmentPath, context } = req.body || {};

    if (!Array.isArray(to) || !to.length) return res.status(400).json({ error: "Missing recipients" });
    if (!subject || !templateKey) return res.status(400).json({ error: "Missing subject/template" });

    // Build HTML from templateKey + context
    const html = renderTemplate(templateKey, { ...context, intro });

    // TODO: Replace with your email provider
    // await sendWithResendOrSendgrid({ to, subject, html, attachments: [{ path: attachmentPath }] });

    // Simulate ok
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("email/send failed", e);
    return res.status(500).json({ error: e?.message || "Send failed" });
  }
}

function renderTemplate(key: string, ctx: any) {
  const greeting = `Hi ${ctx.contactName || "there"},`;
  const body = ctx.intro || "";
  const signoff = `<br/><br/>Cheers,<br/>${ctx.repName || "Team"}`;
  switch (key) {
    case "intro_onepager":
      return `<p>${greeting}</p><p>${body}</p><p>Attached is our one-pager for a quick overview.</p>${signoff}`;
    case "intro_pricing":
      return `<p>${greeting}</p><p>${body}</p><p>Attached is a brief pricing overview.</p>${signoff}`;
    default:
      return `<p>${greeting}</p><p>${body}</p>${signoff}`;
  }
}
