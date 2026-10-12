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
  consumeEntitlement,
  verifyAgentReadyPayment,
  _consumedNonces,
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

// Entitlement: issue, verify, tamper, expire, consume-once
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

_consumedNonces.clear();
assert.equal(consumeEntitlement(payload, 1_000_200), true, "first use should consume");
assert.equal(consumeEntitlement(payload, 1_000_201), false, "second use of same entitlement must fail");

// Network-shaped verification with an injected fetch (mock, not live phoenixd)
(async () => {
  const mockPaid = async () => ({ ok: true, json: async () => good });
  const verified = await verifyAgentReadyPayment(HASH, mockPaid);
  assert.equal(verified.paid, true, "mock paid agentready payment should verify");

  const mockForeign = async () => ({ ok: true, json: async () => ({ ...good, receivedSat: 1000, requestedSat: 1000, description: "someone else" }) });
  const foreign = await verifyAgentReadyPayment(HASH, mockForeign);
  assert.equal(foreign.paid, false, "mock foreign 1000-sat payment must not unlock agentready");

  const mockMissing = async () => ({ ok: false, json: async () => ({}) });
  const missing = await verifyAgentReadyPayment(HASH, mockMissing);
  assert.equal(missing.paid, false, "unknown paymentHash must fail");

  console.log("OK — payment tests passed (amount, description, replay, tamper, expiry controls)");
})().catch((err) => { console.error(err); process.exit(1); });
