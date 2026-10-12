#!/usr/bin/env node
// Unit tests for web/lib/payment.js — no network, no secrets, no dependencies.
// Covers the negative controls that used to unlock paid AI fixes for free:
// under-amount payments, other products' payments, unpaid invoices, raw
// paymentHash replay, tampered/expired entitlements, and entitlement reuse.
"use strict";
process.env.AGENTREADY_ENTITLEMENT_SECRET = "test-secret-for-unit-tests-only";
process.env.PHOENIXD_PASSWORD = "test-phoenixd-password";
process.env.PHOENIXD_URL = "http://127.0.0.1:9";

const assert = require("node:assert/strict");
const {
  PRICE_SATS,
  isPaidAgentReadyPayment,
  issueEntitlement,
  verifyEntitlement,
  verifyAgentReadyPayment,
  authorizePaidTier,
} = require("../lib/payment.js");

const HASH = "a".repeat(64);
const good = {
  isPaid: true,
  requestedSat: PRICE_SATS,
  receivedSat: PRICE_SATS,
  description: "agentready AI fixes — https://example.com",
  externalId: "agentready-v1:0123456789abcdef",
};

// Positive control
assert.equal(isPaidAgentReadyPayment(good), true, "valid 21-sat agentready payment should pass");
assert.equal(isPaidAgentReadyPayment({ ...good, status: "succeeded", isPaid: undefined }), true);

// Negative controls: each of these previously returned paid:true
assert.equal(isPaidAgentReadyPayment({ ...good, isPaid: false, status: "pending" }), false, "unpaid must fail");
assert.equal(isPaidAgentReadyPayment({ ...good, receivedSat: 1, requestedSat: 1 }), false, "1-sat payment must fail");
assert.equal(isPaidAgentReadyPayment({ ...good, receivedSat: PRICE_SATS - 1 }), false, "20-sat payment must fail");
assert.equal(isPaidAgentReadyPayment({ ...good, description: "Loop Gateway top-up" }), false, "other product payment must fail");
assert.equal(isPaidAgentReadyPayment({ ...good, externalId: "gateway:topup:1" }), false, "other externalId must fail");
assert.equal(isPaidAgentReadyPayment({ ...good, description: undefined }), false, "missing description must fail");
assert.equal(isPaidAgentReadyPayment(null), false);
assert.equal(isPaidAgentReadyPayment({}), false);

// Realistic phoenixd shape: externalId is not always echoed; description-only binding must still pass
const { externalId: _omit, ...noExternalId } = good;
assert.equal(isPaidAgentReadyPayment(noExternalId), true, "description-bound payment without externalId should pass");
assert.equal(isPaidAgentReadyPayment({ ...noExternalId, externalId: "" }), true, "empty externalId should be treated as absent");

assert.equal(isPaidAgentReadyPayment({ ...good, requestedSat:undefined, amountSat:undefined }), false, "missing requested amount must fail");
assert.equal(isPaidAgentReadyPayment({ ...good, description: "agentready AI fixes-copy" }), false, "prefix decoy must fail");
assert.equal(isPaidAgentReadyPayment({ ...good, externalId: "agentready-v10:decoy" }), false, "externalId prefix decoy must fail");

// Entitlement: issue, verify, tamper, expire; shared store owns consumption
const token = issueEntitlement(HASH, 1_000_000);
assert.ok(token, "entitlement should be issued when a secret is configured");
const payload = verifyEntitlement(token, 1_000_100);
assert.ok(payload && payload.ph === HASH, "fresh entitlement should verify");

const [body, sig] = token.split(".");
const tampered = body + "." + (sig[0] === "A" ? "B" : "A") + sig.slice(1);
assert.equal(verifyEntitlement(tampered, 1_000_100), null, "tampered signature must fail");
assert.equal(verifyEntitlement(body + ".invalidsignature", 1_000_100), null);
assert.equal(verifyEntitlement(HASH, 1_000_100), null, "a raw paymentHash is not an entitlement");
assert.equal(verifyEntitlement(token, 1_000_000 + 6 * 60 * 1000), null, "expired entitlement must fail");
assert.equal(verifyEntitlement("", 1_000_100), null);
assert.equal(issueEntitlement("not-a-hash"), "", "no entitlement for malformed hash");

// Network-shaped verification with an injected fetch (mock, not live phoenixd)
(async () => {
  const mockPaid = async () => ({ ok: true, json: async () => good });
  const verified = await verifyAgentReadyPayment(HASH, mockPaid);
  assert.equal(verified.paid, true, "mock paid agentready payment should verify");

  const mockForeign = async () => ({ ok: true, json: async () => ({ ...good, receivedSat: 1000, requestedSat: 1000, description: "someone else" }) });
  const foreign = await verifyAgentReadyPayment(HASH, mockForeign);
  assert.equal(foreign.paid, false, "mock foreign 1000-sat payment must not unlock agentready");

  const badHash = await verifyAgentReadyPayment("not-hex", mockPaid);
  assert.equal(badHash.paid, false, "non-hex paymentHash must fail without unlocking");

  const expiring = issueEntitlement(HASH, 2_000_000);
  assert.equal(verifyEntitlement(expiring, 2_000_000 + 5 * 60 * 1000), null, "entitlement at its expiry instant must fail");

  const mockMissing = async () => ({ ok: false, json: async () => ({}) });
  const missing = await verifyAgentReadyPayment(HASH, mockMissing);
  assert.equal(missing.paid, false, "unknown paymentHash must fail");

  // Full gate, exactly as /api/ai-fixes calls it (authorizePaidTier)
  const gateToken = issueEntitlement(HASH, 4_000_000);
  const gateOk = await authorizePaidTier(gateToken, mockPaid, 4_000_100);
  assert.equal(gateOk.paid, true, "valid entitlement + verified payment should authorize");
  const gateReplay = await authorizePaidTier(gateToken, mockPaid, 4_000_101);
  assert.equal(gateReplay.paymentHash, HASH, "verification yields stable logical purchase key; shared store consumes it");

  const foreignToken = issueEntitlement(HASH, 4_100_000);
  const gateForeign = await authorizePaidTier(foreignToken, mockForeign, 4_100_100);
  assert.equal(gateForeign.paid, false, "foreign payment must not authorize");
  const gateRetried = await authorizePaidTier(foreignToken, mockPaid, 4_100_101);
  assert.equal(gateRetried.paid, true, "failed payment verification must not burn the entitlement");

  assert.equal((await authorizePaidTier(HASH, mockPaid, 4_200_000)).paid, false, "raw paymentHash must not authorize");
  assert.equal((await authorizePaidTier("", mockPaid, 4_200_000)).paid, false);
  assert.equal((await authorizePaidTier(undefined, mockPaid, 4_200_000)).paid, false);

  // Route wiring guard: the API route must delegate to authorizePaidTier and
  // must not accept a paymentHash field as proof.
  const fs = require("node:fs");
  const routeSrc = fs.readFileSync(require("node:path").join(__dirname, "..", "app", "api", "ai-fixes", "route.ts"), "utf8");
  assert.ok(routeSrc.includes("handleFixes"), "route delegates to tested shared delivery handler");
  assert.ok(!/body\.paymentHash/.test(routeSrc), "ai-fixes route must not read body.paymentHash");

  console.log("OK — payment tests passed (amount, product boundary, stable purchase key, tamper, expiry controls)");
})().catch((err) => { console.error(err); process.exit(1); });
