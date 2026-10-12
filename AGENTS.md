# agentready — agent instructions

Canonical company entry: AGENT START HERE (Notion). This repo is the
`agentready` CLI (zero dependencies) plus the Next.js web app in `web/`.

- Deploy target: Vercel project `agentready` in the Loop XXI team,
  root directory `web`, custom domain `agentready.loopxxi.com`.
  Deployed 2026-10-12 from merged main (PR 1, merge 9f53ac5).
  Live checks that day: home 200, /api/audit works, /api/pay/request
  returns 503 until payment env vars are set, and a garbage entitlement
  to /api/ai-fixes returns the free tier. The paid tier is NOT live
  until PHOENIXD_URL, PHOENIXD_PASSWORD, OPENROUTER_API_KEY, and
  AGENTREADY_ENTITLEMENT_SECRET are set in Vercel Production and a
  real paid call plus the negative controls pass on the live URL.
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
