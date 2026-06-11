/**
 * lib/audit-runner.js
 * CommonJS wrapper — used by both the CLI (bin/agentready.js)
 * and the Next.js API route (app/api/audit/route.ts).
 * Re-exports audit() from lib/checks.js with no extra deps.
 */
"use strict";

// When imported from Next.js (which has its own bundler), we need
// to handle both CJS and the bundled path. Using require() directly
// so this works in Node 18+ without ESM complications.
const { audit, probe, normalizeOrigin, grade, VERSION, checks } = require("./checks.js");

module.exports = { audit, probe, normalizeOrigin, grade, VERSION, checks };
