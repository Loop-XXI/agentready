#!/usr/bin/env node
/**
 * agentready — audit any website for AI-agent readiness.
 *
 * Zero dependencies. Node 18+.
 * Usage:
 *   npx agentready example.com
 *   agentready example.com --json
 *
 * (c) Loop XXI — MIT License
 */

"use strict";

const { audit, VERSION } = require("../lib/checks.js");

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m",
};
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? code + s + C.reset : s);

function gradeColor(letter) {
  if (letter === "A" || letter === "B") return C.green;
  if (letter === "C" || letter === "D") return C.yellow;
  return C.red;
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("-"));

  if (args.includes("--version") || args.includes("-v")) {
    console.log(VERSION);
    return;
  }

  if (positional.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
agentready v${VERSION} — audit any website for AI-agent readiness

usage:
  agentready <url>            run audit, human-readable report
  agentready <url> --json     machine-readable output (agents welcome)
  agentready --version

checks: llms.txt, llms-full.txt, robots.txt + AI crawler policy, sitemap,
JSON-LD structured data, meta/OG tags, OpenAPI discovery, MCP manifest,
.well-known surface, feeds, markdown content-negotiation, HTTPS, response speed.

exit code: 0 if score >= 60, 1 otherwise (CI-friendly).

(c) Loop XXI  https://loopxxi.com
`);
    return;
  }

  const result = await audit(positional[0]);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.error ? 2 : result.score >= 60 ? 0 : 1);
    return;
  }

  if (result.error) {
    console.error("  " + c(C.red, result.error));
    process.exit(2);
    return;
  }

  console.log("");
  console.log("  " + c(C.bold, "agentready ") + c(C.dim, "v" + VERSION) + "  →  " + c(C.cyan, result.origin));
  console.log("");

  for (const r of result.checks) {
    const mark = r.pass ? (r.partial ? c(C.yellow, "◐") : c(C.green, "●")) : c(C.red, "○");
    const pad = " ".repeat(Math.max(1, 32 - r.label.length));
    console.log("  " + mark + " " + r.label + pad + c(C.dim, r.detail || ""));
  }

  const col = gradeColor(result.grade);
  console.log("");
  console.log("  " + c(C.bold, "score ") + c(col, c(C.bold, result.score + "/100  (" + result.grade + ")")));
  console.log("");

  const fixes = result.checks.filter((r) => r.fix);
  if (fixes.length) {
    console.log(c(C.bold, "  to improve:"));
    for (const f of fixes.slice(0, 6)) {
      console.log(c(C.dim, "  · ") + f.fix);
    }
    console.log("");
  }

  process.exit(result.score >= 60 ? 0 : 1);
}

main().catch((e) => {
  console.error("agentready: " + e.message);
  process.exit(2);
});
