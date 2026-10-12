import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const paymentLib = require("../../../../lib/payment") as {
  verifyAgentReadyPayment: (hash: string) => Promise<{ configured: boolean; paid: boolean; data: { completedAt?: number } | null }>;
  issueEntitlement: (hash: string) => string;
};

/**
 * GET /api/pay/check?paymentHash=<64-hex>
 * Verifies a 21-sat agentready invoice against phoenixd (amount, description,
 * and product binding are checked in lib/payment). On success it also returns
 * a short-lived verification entitlement for /api/ai-fixes. A paymentHash alone
 * is never an entitlement.
 */
export async function GET(req: NextRequest) {
  const paymentHash = req.nextUrl.searchParams.get("paymentHash") ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(paymentHash)) {
    return NextResponse.json({ error: "Invalid paymentHash" }, { status: 400 });
  }
  try {
    const { configured, paid, data } = await paymentLib.verifyAgentReadyPayment(paymentHash);
    if (!configured) {
      return NextResponse.json({ error: "Lightning not configured" }, { status: 503 });
    }
    const entitlement = paid ? paymentLib.issueEntitlement(paymentHash) : "";
    if (paid && !entitlement) {
      return NextResponse.json({ error: "Entitlement not configured" }, { status: 503 });
    }
    return NextResponse.json(
      { paid, entitlement: entitlement || undefined, settledAt: paid ? (data?.completedAt ?? Date.now()) : undefined },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
