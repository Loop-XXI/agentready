# Shared purchase redemption

Scope: one AI generation per verified 21-sat AgentReady payment, independent of token nonce, instance, restart or entitlement reissuance. Payment verification stays in web/lib/payment.js. Shared application fulfillment state is not a revenue ledger.

Use the existing Loop XXI Ops Postgres through a server-only REST RPC credential sourced from 1Password. No new hosted service, package dependency or subscription. New table and versioned security-invoker RPCs are additive; anon/authenticated roles have no access. Production migration requires independent review of the exact SQL. Existing service_role access is server-only; prefer an approved narrowly scoped consumer credential where infrastructure supports it.

Protocol: verify entitlement and settlement, derive canonical request fingerprint, atomically claim payment hash. Only claim owner dispatches. A completed purchase returns its stored result for the same request without another provider call. A different request is rejected, even with a new token. Definitive HTTP 429 rejection is retryable. Unknown network outcome, 5xx, malformed provider output or crashed worker is held for operator reconciliation, never automatically redispatched. Successful response is stored before delivery. Completion can be retried with the same claim owner; lost completion acknowledgment is recovered from durable state. No timed lease takeover: expiration cannot prove an upstream request did not run.

Acceptance: actual Postgres concurrent claims produce one winner; reissued tokens and fresh client/processes never dispatch a second generation; completed response survives restart; changed input fails; known rejection can retry; unknown provider outcome cannot; storage outage fails closed; stale owner cannot complete/release a newer claim; completion acknowledgment loss recovers without another provider call; anonymous callers cannot execute RPCs.

Rollout: install reviewed additive schema; inject AGENTREADY_STORE_URL and AGENTREADY_STORE_KEY from 1Password; deploy reviewed code; verify exact revision and live RPC behavior. Absent store fails closed for paid requests and invoice issuance, leaving free audit intact. Do not accept fresh money while fulfillment storage is unavailable.

Rollback: stop new invoice issuance first. Keep durable rows and functions. Roll back to a revision using shared persistence or leave paid path disabled. Never return to the in-memory paywall with payments enabled. Migration reversal revokes consumer RPC access without dropping data. Reserved/uncertain rows require explicit operator investigation, never deletion to retry.

Historical self-pay does not establish external revenue. Previously completed payment hashes must be seeded as spent before enabling the new paid path, or legacy invoices disabled by a verified cutover timestamp.

Regression command: `node test/run.js && node web/test/payment.test.js`, then
`AGENTREADY_PGLITE_MODULE=/absolute/scratch/node_modules/@electric-sql/pglite AGENTREADY_TEST_DB=/absolute/new-test-db node web/test/redemption.test.js`.
Use a new database directory each run. The suite creates test roles and installs the real migration, then exercises RPCs as service_role; anon and authenticated controls must fail. PGlite serializes execution, so its Promise race is a scheduling regression, not hosted multi-connection proof. Hosted acceptance must issue simultaneous REST claims against the same synthetic purchase and observe one winner.

Cutover inventory 2026-10-12: authenticated phoenixd incoming list returned 33 records (limit 1000), two AgentReady-described records: one fulfilled 21-sat self-test (seeded) and one paid 1-sat negative control (ineligible). Recheck immediately before cutover. Any additional eligible legacy payment must be reconciled before enabling purchases; do not silently discard an unfulfilled customer obligation.
