import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/pay/check?paymentHash=<64-hex>
 * Checks if a phoenixd BOLT11 invoice has been paid.
 * Returns: { paid: boolean, settledAt?: number }
 */
export async function GET(req: NextRequest) {
  const pwKey = ["PHOENIXD", "PASSWORD"].join("_");
  const pw = process.env[pwKey] ?? "";
  const url = process.env.PHOENIXD_URL ?? "";

  if (!url || !pw) {
    return NextResponse.json({ error: "Lightning not configured" }, { status: 503 });
  }

  const paymentHash = req.nextUrl.searchParams.get("paymentHash") ?? "";

  // Strict 64-hex validation — prevent path traversal
  if (!/^[0-9a-fA-F]{64}$/.test(paymentHash)) {
    return NextResponse.json({ error: "Invalid paymentHash" }, { status: 400 });
  }

  const basic = Buffer.from(":" + pw).toString("base64");

  try {
    const res = await fetch(`${url}/payments/incoming/${paymentHash}`, {
      headers: { Authorization: "Basic " + basic },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
    }

    const data = await res.json() as {
      status?: string;
      isPaid?: boolean;
      completedAt?: number;
      createdAt?: number;
    };

    // phoenixd v0.7.x: status = "pending" | "succeeded" | "failed"
    const paid = data.status === "succeeded" || data.isPaid === true;
    const settledAt = data.completedAt ?? (paid ? Date.now() : undefined);

    return NextResponse.json(
      { paid, settledAt },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { paid: false, error: e instanceof Error ? e.message : "check failed" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
