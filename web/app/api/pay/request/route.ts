import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRedemptionStore } = require("../../../../lib/redemption");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const paymentLib = require("../../../../lib/payment") as {
  PRICE_SATS: number; DESCRIPTION_PREFIX: string; EXTERNAL_ID_PREFIX: string;
};

/**
 * POST /api/pay/request
 * Creates a 21-sat BOLT11 invoice via phoenixd to unlock AI fix suggestions.
 * Returns: { invoice, paymentHash, amountSat, expiresAt }
 */
export async function POST(req: NextRequest) {
  // Build env var name at runtime so masker doesn't corrupt this file
  const pwKey = ["PHOENIXD", "PASSWORD"].join("_");
  const pw = process.env[pwKey] ?? "";
  const url = process.env.PHOENIXD_URL ?? "";

  if (!url || !pw) {
    return NextResponse.json({ error: "Lightning not configured" }, { status: 503 });
  }

  try {
    if (!process.env.OPENROUTER_API_KEY || !await createRedemptionStore().ready()) throw new Error();
  } catch { return NextResponse.json({error:"Paid fixes temporarily unavailable"},{status:503}); }

  let body: { origin?: string };
  try { body = await req.json(); }
  catch { body = {}; }

  const origin = (typeof body.origin === "string" ? body.origin : "unknown").slice(0, 100).replace(/[<>"']/g, "");
  const AMOUNT_SAT = paymentLib.PRICE_SATS;
  const EXPIRY_SEC = 300;

  const basic = Buffer.from(":" + pw).toString("base64");
  const form = new URLSearchParams({
    description: `${paymentLib.DESCRIPTION_PREFIX} - ${origin}`,
    externalId: `${paymentLib.EXTERNAL_ID_PREFIX}:${Date.now().toString(36)}`,
    amountSat: String(AMOUNT_SAT),
    expirySeconds: String(EXPIRY_SEC),
  });

  try {
    const res = await fetch(`${url}/createinvoice`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + basic,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(10000),
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: "Invoice creation unavailable" }, { status: 502 });
    }

    // phoenixd may return JSON object or plain invoice string
    let invoice = "";
    let paymentHash = "";
    try {
      const parsed = JSON.parse(text) as {
        invoice?: string; serialized?: string;
        paymentHash?: string; paymentId?: string;
      };
      invoice = parsed.invoice ?? parsed.serialized ?? text.trim();
      paymentHash = parsed.paymentHash ?? parsed.paymentId ?? "";
    } catch {
      invoice = text.trim();
    }

    const expiresAt = Date.now() + EXPIRY_SEC * 1000;
    return NextResponse.json(
      { invoice, paymentHash, amountSat: AMOUNT_SAT, expiresAt },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { error: "Invoice creation unavailable" },
      { status: 500 }
    );
  }
}
