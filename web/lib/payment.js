"use strict";
/**
 * payment.js — shared Lightning payment verification for the agentready web app.
 *
 * Security model (read before changing):
 * - A paymentHash alone is NOT an entitlement. BOLT11 payment hashes are public
 *   to anyone who saw the invoice, and a hash from any other product on the
 *   same phoenixd node must never unlock agentready AI fixes.
 * - Paid tier requires ALL of: phoenixd reports the payment paid, the invoice
 *   was requested for exactly PRICE_SATS, at least PRICE_SATS was received,
 *   and the invoice description carries the agentready prefix (externalId,
 *   when phoenixd echoes it, must also carry the agentready prefix).
 * - Entitlements authorize verification, not consumption. Shared Postgres
 *   redemption is keyed by paymentHash in redemption.js. Reissued nonces do
 *   not grant another purchase. No in-memory paid consumption exists.
 *
 * No secrets are logged or returned. The entitlement secret is
 * AGENTREADY_ENTITLEMENT_SECRET when set, otherwise the server-only
 * phoenixd password (never exposed to clients) with a domain separator.
 */
const crypto = require("crypto");

const PRICE_SATS = 21;
const DESCRIPTION_PREFIX = "agentready AI fixes";
const EXTERNAL_ID_PREFIX = "agentready-v1";
const ENTITLEMENT_TTL_MS = 5 * 60 * 1000;
const HEX64 = /^[0-9a-fA-F]{64}$/;


function phoenixConfig() {
  const password = process.env.PHOENIXD_PASSWORD ?? "";
  const url = (process.env.PHOENIXD_URL ?? "").replace(/\/+$/, "");
  return { password, url, configured: Boolean(password && url) };
}

function entitlementSecret() {
  const dedicated = process.env.AGENTREADY_ENTITLEMENT_SECRET ?? "";
  if (dedicated) return dedicated;
  const fallback = process.env.PHOENIXD_PASSWORD ?? "";
  return fallback ? `agentready-entitlement:${fallback}` : "";
}

/** Pure check of a phoenixd incoming-payment object. Exported for tests. */
function isPaidAgentReadyPayment(data) {
  if (!data || typeof data !== "object") return false;
  const paid = data.isPaid === true || data.status === "succeeded";
  if (!paid) return false;
  const requested = Number(data.requestedSat ?? data.amountSat);
  const received = Number(data.receivedSat ?? 0);
  if (!Number.isFinite(requested) || requested !== PRICE_SATS) return false;
  if (!Number.isFinite(received) || received < PRICE_SATS) return false;
  if (typeof data.description !== "string" || !(data.description === DESCRIPTION_PREFIX || data.description.startsWith(DESCRIPTION_PREFIX + " - ") || data.description.startsWith(DESCRIPTION_PREFIX + " \u2014 "))) return false;
  if (data.externalId != null && data.externalId !== "") {
    if (typeof data.externalId !== "string" || !data.externalId.startsWith(EXTERNAL_ID_PREFIX + ":")) return false;
  }
  return true;
}

async function fetchIncomingPayment(paymentHash, fetchImpl) {
  const { password, url, configured } = phoenixConfig();
  if (!configured) return { configured: false, data: null };
  if (!HEX64.test(paymentHash || "")) return { configured: true, data: null };
  const doFetch = fetchImpl || fetch;
  const basic = Buffer.from(":" + password).toString("base64");
  const res = await doFetch(`${url}/payments/incoming/${paymentHash}`, {
    headers: { Authorization: "Basic " + basic },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { configured: true, data: null };
  return { configured: true, data: await res.json() };
}

async function verifyAgentReadyPayment(paymentHash, fetchImpl) {
  const { configured, data } = await fetchIncomingPayment(paymentHash, fetchImpl);
  if (!configured) return { configured: false, paid: false, data: null };
  return { configured: true, paid: isPaidAgentReadyPayment(data), data };
}

function sign(payloadB64, secret) {
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function issueEntitlement(paymentHash, now = Date.now()) {
  const secret = entitlementSecret();
  if (!secret || !HEX64.test(paymentHash || "")) return "";
  const payload = {
    v: 1,
    ph: paymentHash.toLowerCase(),
    exp: now + ENTITLEMENT_TTL_MS,
    n: crypto.randomBytes(16).toString("hex"),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** Returns the parsed payload when signature + expiry are valid, else null. */
function verifyEntitlement(token, now = Date.now()) {
  const secret = entitlementSecret();
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")); }
  catch { return null; }
  if (!payload || payload.v !== 1 || !HEX64.test(payload.ph || "")) return null;
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.n !== "string" || payload.n.length < 16) return null;
  return payload;
}

/** Verify proof and settlement; shared fulfillment owns atomic consumption. */
async function authorizePaidTier(entitlementToken, fetchImpl, now = Date.now()) {
  if (typeof entitlementToken !== "string" || !entitlementToken.trim()) {
    return { paid: false, reason: "missing_entitlement" };
  }
  const payload = verifyEntitlement(entitlementToken.trim(), now);
  if (!payload) return { paid: false, reason: "invalid_entitlement" };
  const verified = await verifyAgentReadyPayment(payload.ph, fetchImpl);
  if (!verified.configured) return { paid: false, reason: "payments_not_configured" };
  if (!verified.paid) return { paid: false, reason: "payment_not_verified" };
  return { paid: true, reason: "ok", paymentHash: payload.ph.toLowerCase() };
}

module.exports = {
  PRICE_SATS,
  DESCRIPTION_PREFIX,
  EXTERNAL_ID_PREFIX,
  ENTITLEMENT_TTL_MS,
  phoenixConfig,
  isPaidAgentReadyPayment,
  verifyAgentReadyPayment,
  issueEntitlement,
  verifyEntitlement,
  authorizePaidTier,
};
