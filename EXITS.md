# Dependency exits

Every runtime dependency, what it does, and how we leave it. No new
dependency is added without an entry here first.

| Dependency | Used by | License | Exit plan |
|---|---|---|---|
| `next` | `web/` app framework, API routes, SSR | MIT | The web app is a thin shell over the zero-dependency CLI auditor in `lib/`; on exit, serve `lib/checks.js` results from any Node HTTP server. |
| `react`, `react-dom` | `web/` UI | MIT | UI only; the audit and payment APIs have no React dependency and can be re-hosted without it. |
| `@sentry/nextjs` | `web/` error reporting | MIT (SDK) | Remove the wrapper in `web/next.config.js` and the Sentry config files; the app runs without it. Error reporting is observability, never a buyer-path dependency. |
| `typescript`, `@types/node`, `@types/react`, `@types/react-dom` (dev) | `web/` type checking | MIT / Apache-2.0 | Build-time only; runtime code paths (`lib/*.js`, API logic) are plain JavaScript. |

The CLI (`bin/`, `lib/`) has zero dependencies by design and needs no exit plan.
External services (not packages): phoenixd (Lightning payments, self-hosted)
and OpenRouter (paid AI fixes). Both are called over plain HTTPS with
server-side credentials from the deployment environment; either can be
disabled by removing its env vars, which degrades the web app to the
free audit + free hints instead of failing.

Shared fulfillment persistence uses existing Supabase/Postgres over plain
server-side HTTPS RPC. No Supabase SDK or new runtime package is required.
Exit: export the redemption table and SQL functions to any Postgres host;
replace only the REST adapter. Never discard spent rows during an exit.
The optional SQL regression harness uses @electric-sql/pglite (Apache-2.0),
installed in scratch space only. It is PostgreSQL WASM, not production proof.
Exit: run the same SQL contract cases against any disposable Postgres.
