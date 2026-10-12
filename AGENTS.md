# agentready — agent instructions

Canonical company entry: AGENT START HERE (Notion). This repo is the
`agentready` CLI (zero dependencies) plus the Next.js web app in `web/`.

- Deploy target: Vercel project `agentready` in the Loop XXI team,
  root directory `web`, custom domain `agentready.loopxxi.com`.
  Deployed 2026-10-12 from merged main (PR 1, merge 9f53ac5).
  Production env vars were set later on 2026-10-12 (PHOENIXD_URL,
  PHOENIXD_PASSWORD, OPENROUTER_API_KEY, AGENTREADY_ENTITLEMENT_SECRET)
  and the project was redeployed. Live checks after that: home 200,
  /api/audit works, /api/pay/request creates a 21-sat invoice (200),
  an unpaid invoice checks paid:false, and raw-hash, garbage, and
  forged entitlements to /api/ai-fixes return the free tier.
  Still outstanding: one real paid 21-sat call on the live URL (the
  company Alby wallet showed 0 sats, and phoenixd cannot pay its own
  invoice), after which the same entitlement must fail on replay.
  Wrong-amount and foreign-payment controls are covered by unit tests
  with mock phoenixd responses, not yet by a live paid payment.
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
