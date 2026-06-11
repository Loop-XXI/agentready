/**
 * audit-runner.js
 * Bridge: re-exports { audit } from the root lib/checks.js
 * so Next.js API routes can import it without path gymnastics.
 * Placed at web/lib/ so Next.js treats it as a local module.
 */
"use strict";
const { audit } = require("../../lib/checks.js");
module.exports = { audit };
