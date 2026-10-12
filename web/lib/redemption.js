"use strict";
const crypto = require('node:crypto');

function requestFingerprint(request) {
  return crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
}

function createRedemptionStore({url = process.env.AGENTREADY_STORE_URL, key = process.env.AGENTREADY_STORE_KEY, fetchImpl = fetch} = {}) {
  if (!url || !key) throw new Error('redemption_store_not_configured');
  if (!/^https:\/\/[^/?#@]+$/.test(url)) throw new Error('invalid_store_url');
  async function rpc(name, args) {
    const res = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: {'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`},
      body: JSON.stringify(args), signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error('redemption_store_unavailable');
    return res.json();
  }
  return {
    claim: (hash, fingerprint, owner) => rpc('agentready_claim_v1', {p_hash:hash, p_fingerprint:fingerprint, p_owner:owner}),
    complete: (hash, owner, result) => rpc('agentready_complete_v1', {p_hash:hash, p_owner:owner, p_result:result}),
    fail: (hash, owner, retryable) => rpc('agentready_fail_v1', {p_hash:hash, p_owner:owner, p_retryable:retryable}),
    ready: () => rpc('agentready_ready_v1', {}),
  };
}

/** Dispatch is permitted exactly once per claim. No expiring lease takeover. */
async function fulfillPurchase({hash, request, store, generate}) {
  const fingerprint = requestFingerprint(request);
  const owner = crypto.randomUUID();
  const claim = await store.claim(hash, fingerprint, owner);
  if (claim.status === 'completed') return {status:'completed', result:claim.result, cached:true};
  if (claim.status !== 'claimed') return {status:claim.status};
  let result;
  try { result = await generate(request); }
  catch (err) {
    // Only an explicit provider rate-limit rejection is known not to have delivered.
    // Timeouts/5xx/crashes may have run upstream: never retry them automatically.
    await store.fail(hash, owner, err?.retryable === true).catch(() => {});
    return {status:err?.retryable === true ? 'retryable' : 'uncertain'};
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const finalized = await store.complete(hash, owner, result);
      if (finalized.status === 'completed') return {status:'completed',result:finalized.result,cached:false};
      return {status:'uncertain'};
    } catch { /* safe same-owner finalize retry, never provider redispatch */ }
  }
  try {
    const recovered = await store.claim(hash, fingerprint, owner);
    if (recovered.status === 'completed') return {status:'completed', result:recovered.result, cached:true};
  } catch { /* persistence is unknown, withhold delivery */ }
  return {status:'uncertain'};
}
module.exports = {createRedemptionStore, requestFingerprint, fulfillPurchase};
