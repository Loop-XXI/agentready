# agentready — agent instructions

Canonical company entry: AGENT START HERE (Notion). This repo is the
`agentready` CLI (zero dependencies) plus the Next.js web app in `web/`.

- Deploy target: Vercel project for `agentready.loopxxi.com`.
  Live check 2026-10-12: that host returned Vercel `DEPLOYMENT_NOT_FOUND`,
  so the web app is NOT currently deployed. Do not claim it is live
  until a fresh deployment and a buyer-path check prove it.
- Tests: `node test/run.js` (CLI) and `node web/test/payment.test.js`
  (payment verification + entitlement unit tests, mocks only).
  `web`: `npm run build` before any deploy.
- Release gate: independent review of the exact commit, then the
  Loop ship gate. A green build proves the build, not the buyer path:
  verify invoice creation, payment check, and one paid AI-fixes call
  (and the unpaid / wrong-amount / replay negative controls) on the
  deployed URL before calling the paywall live.
- Secrets come from the deployment environment only. Never commit
  `.env` files or print secret values.
