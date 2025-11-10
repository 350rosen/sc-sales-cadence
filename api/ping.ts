// /api/ping.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    env: {
      hasUser: !!process.env.GMAIL_USER,
      hasPass: !!process.env.GMAIL_PASS,
    },
    time: new Date().toISOString(),
  });
}