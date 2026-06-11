import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { audit } = require("../../../lib/audit-runner") as { audit: (url: string) => Promise<unknown> };

// SSRF guard — only allow public http/https URLs
function validateUrl(raw: string): string | null {
  let u = raw.trim();
  if (!u) return null;
  if (/^(file|ftp|javascript|data|vbscript):/i.test(u)) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) return null;
    return parsed.origin;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!body.url || typeof body.url !== "string")
    return NextResponse.json({ error: "Missing required field: url" }, { status: 400 });

  const origin = validateUrl(body.url);
  if (!origin)
    return NextResponse.json(
      { error: "Invalid URL — must be a public http/https address (no localhost)" },
      { status: 400 }
    );

  try {
    const result = await audit(origin);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal error" }, { status: 500 });
  }
}
