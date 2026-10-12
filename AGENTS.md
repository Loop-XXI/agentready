# agentready — agent instructions

Canonical company entry: AGENT START HERE (Notion). This repo is the
`agentready` CLI (zero dependencies) plus the Next.js web app in `web/`.

- Deploy target: Vercel project `agentready` in the Loop XXI team,
  root directory `web`, custom domain `agentready.loopxxi.com`.
  Deployed 2026-10-12 from merged main (PR 1, merge 9f53ac5), with
  Production env vars set the same day and a redeploy.
  Live verification 2026-10-12: home 200, /api/audit works,
  /api/pay/request creates a 21-sat invoice, unpaid checks paid:false,
  and raw-hash, garbage, and forged entitlements return the free tier.
  A SELF-PAY test then paid the 21-sat invoice from the company
  phoenixd node: check issued an entitlement, /api/ai-fixes returned
  tier ai, and replaying that entitlement returned the free tier.
  Paid 1-sat (agentready description) and paid 21-sat (foreign
  description) control invoices both check paid:false live.
  Self-pay is a test, not revenue. External revenue: NOT FOUND.
- Tests: `node test/run.js` (CLI) and `node web/test/payment.test.js`
  (payment verification + entitlement unit tests, mocks only).
  `web`: `npm run build` before any deploy.
- Release gate: independent review of the exact commit before merge.
  A green build proves the build, not the buyer path: verify invoice
  creation, payment check, and one paid AI-fixes call (and the unpaid,
  wrong-amount, and replay negative controls) on the deployed URL
  before calling the paywall live.
- Secrets come from the deployment environment only. Never commit
  `.env` files or print secret values.
