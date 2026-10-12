import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type FailedCheck = { id: string; label: string; weight: number; detail?: string; fix?: string };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const paymentLib = require("../../../lib/payment") as {
  verifyAgentReadyPayment: (hash: string) => Promise<{ configured: boolean; paid: boolean }>;
  verifyEntitlement: (token: string) => { ph: string; n: string; exp: number } | null;
  consumeEntitlement: (payload: { ph: string; n: string; exp: number }) => boolean;
};

/**
 * POST /api/ai-fixes
 * Requires a one-time entitlement from /api/pay/check, bound to a phoenixd payment that this route re-verifies (21 sats, agentready invoice) before spending on the AI provider.
 * Free tier: returns baked-in fix hints.
 * Paid (21 sats): returns Claude AI-generated, site-specific fixes.
 */
export async function POST(req: NextRequest) {
  let body: { origin?: string; score?: number; grade?: string; failed?: FailedCheck[]; entitlement?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!body.origin || !Array.isArray(body.failed) || body.failed.length === 0)
    return NextResponse.json({ fixes: {} });

  const origin = body.origin.slice(0, 200).replace(/[<>"']/g, "");
  const failed = body.failed.slice(0, 10);
  const orKey = ["OPENROUTER", "API", "KEY"].join("_");
  const apiKey = process.env[orKey] ?? "";

  // --- Payment gate ---
  // Paid tier requires a server-issued, one-time entitlement (see
  // /api/pay/check) bound to a verified 21-sat agentready payment.
  // A raw paymentHash is public invoice data and is never accepted here.
  let paid = false;
  const entitlementToken = typeof body.entitlement === "string" ? body.entitlement.trim() : "";
  if (entitlementToken) {
    const payload = paymentLib.verifyEntitlement(entitlementToken);
    if (payload) {
      const verified = await paymentLib.verifyAgentReadyPayment(payload.ph).catch(() => null);
      if (verified?.paid && paymentLib.consumeEntitlement(payload)) {
        paid = true;
      }
    }
  }

  // Free fallback — return baked-in hints
  if (!paid || !apiKey) {
    const fixes: Record<string, string> = {};
    for (const c of failed) if (c.fix) fixes[c.id] = c.fix;
    return NextResponse.json({ fixes, paid: false, tier: "free" });
  }

  // --- AI tier (paid) ---
  const checkList = failed
    .map((c) => `- ${c.label} (weight: ${c.weight}pt): ${c.detail || "failing"}${c.fix ? ` [hint: ${c.fix}]` : ""}`)
    .join("\n");

  const systemPrompt = `You are an expert in AI agent readiness, llms.txt, robots.txt, OpenAPI, and MCP (Model Context Protocol). Give concise, actionable, technically precise advice to web developers. Max 2 sentences per fix.`;

  const userPrompt = `Site: ${origin} — scored ${body.score ?? "?"}/100 (${body.grade ?? "?"}) on an agent-readiness audit.

Failed checks:
${checkList}

Return ONLY a JSON object: check IDs as keys, specific actionable fix strings as values.
Tailor advice to this site — not generic. Example:
{"llms-txt": "Create /llms.txt listing your API docs at...", "openapi": "Add /openapi.json at..."}
No text outside the JSON.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
        "HTTP-Referer": "https://agentready.loopxxi.com",
        "X-Title": "agentready by Loop XXI",
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4.5",
        max_tokens: 800,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) throw new Error(`openrouter ${res.status}`);

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON in response");

    const fixes = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const sanitized: Record<string, string> = {};
    for (const [k, v] of Object.entries(fixes)) {
      if (typeof k === "string" && typeof v === "string")
        sanitized[k] = v.slice(0, 600).replace(/<[^>]+>/g, "");
    }
    return NextResponse.json({ fixes: sanitized, paid: true, tier: "ai" });
  } catch {
    // AI failed — return free tier fixes, don't lose the sat
    const fixes: Record<string, string> = {};
    for (const c of failed) if (c.fix) fixes[c.id] = c.fix;
    return NextResponse.json({ fixes, paid: true, tier: "ai-fallback" });
  }
}
