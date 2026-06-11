import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type FailedCheck = { id: string; label: string; weight: number; detail?: string; fix?: string };

export async function POST(req: NextRequest) {
  let body: { origin?: string; score?: number; grade?: string; failed?: FailedCheck[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!body.origin || !Array.isArray(body.failed) || body.failed.length === 0)
    return NextResponse.json({ fixes: {} });

  const origin = body.origin.slice(0, 200).replace(/[<>"']/g, "");
  const failed = body.failed.slice(0, 10);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const fixes: Record<string, string> = {};
    for (const c of failed) if (c.fix) fixes[c.id] = c.fix;
    return NextResponse.json({ fixes });
  }

  const checkList = failed
    .map((c) => `- ${c.label} (weight: ${c.weight}pt): ${c.detail || "failing"}${c.fix ? ` [hint: ${c.fix}]` : ""}`)
    .join("\n");

  const systemPrompt = `You are an expert in AI agent readiness, llms.txt, robots.txt, OpenAPI, and MCP (Model Context Protocol). Give concise, actionable, technically precise advice. Max 2 sentences per fix.`;

  const userPrompt = `Site: ${origin} — scored ${body.score}/100 (${body.grade}) on an agent-readiness audit.

Failed checks:
${checkList}

Return ONLY a JSON object: check IDs as keys, fix strings as values.
Example: {"llms-txt": "Create /llms.txt listing...", "openapi": "Add /openapi.json at..."}
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
        model: "anthropic/claude-haiku-4",
        max_tokens: 600,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) throw new Error("upstream error");

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON in response");

    const fixes = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const sanitized: Record<string, string> = {};
    for (const [k, v] of Object.entries(fixes)) {
      if (typeof k === "string" && typeof v === "string")
        sanitized[k] = v.slice(0, 500).replace(/<[^>]+>/g, "");
    }
    return NextResponse.json({ fixes: sanitized });
  } catch {
    const fallback: Record<string, string> = {};
    for (const c of failed) if (c.fix) fallback[c.id] = c.fix;
    return NextResponse.json({ fixes: fallback });
  }
}
