import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 45;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { handleFixes } = require("../../../lib/ai-fixes");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRedemptionStore } = require("../../../lib/redemption");
export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({error:"Invalid JSON body"},{status:400}); }
  let store;
  try { store = createRedemptionStore(); } catch { /* free audit remains available */ }
  const result = await handleFixes(body,{store,apiKey:process.env.OPENROUTER_API_KEY ?? ""});
  return NextResponse.json(result.body,{status:result.httpStatus,headers:{"Cache-Control":"no-store"}});
}
