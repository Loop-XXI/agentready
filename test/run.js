#!/usr/bin/env node
// Test harness for agentready — spins a local server, runs the auditor, asserts on JSON output.
"use strict";
const http = require("http");
const { execFile } = require("child_process");
const path = require("path");

const PAGES = {
  "/": `<!doctype html><html><head><title>Test Site</title>
<meta name="description" content="A test site for agentready">
<meta property="og:title" content="Test"><meta property="og:description" content="t">
<script type="application/ld+json">{"@type":"Organization","name":"Test"}</script>
</head><body>hello</body></html>`,
  "/llms.txt": "# Test Site\n\n- [Docs](https://example.com/docs)\n",
  "/robots.txt": "User-agent: *\nAllow: /\nSitemap: SITEMAP_URL\n",
  "/sitemap.xml": `<?xml version="1.0"?><urlset><url><loc>x</loc></url></urlset>`,
  "/openapi.json": `{"openapi":"3.0.0","info":{"title":"Test API","version":"1.0.0"}}`,
  "/.well-known/security.txt": "Contact: mailto:sec@example.com\n",
  "/.well-known/mcp.json": `{"name":"test","tools":[]}`,
  "/feed.xml": `<rss version="2.0"><channel></channel></rss>`,
};

const server = http.createServer((req, res) => {
  const body = PAGES[req.url.split("?")[0]];
  if (body) {
    res.writeHead(200, { "Content-Type": req.url === "/" ? "text/html" : "text/plain" });
    res.end(body.replace("SITEMAP_URL", `http://127.0.0.1:${server.address().port}/sitemap.xml`));
  } else {
    res.writeHead(404); res.end("nope");
  }
});

server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  const bin = path.join(__dirname, "..", "bin", "agentready.js");
  execFile("node", [bin, `http://127.0.0.1:${port}`, "--json"], { encoding: "utf8" }, (err, stdout) => {
    const out = stdout || "";
    server.close();

    const fail = (msg) => { console.error("FAIL: " + msg + "\n" + out); process.exit(1); };
    let j;
    try { j = JSON.parse(out); } catch { fail("output is not JSON"); }
    if (!j.checks) fail("no checks in output: " + (j.error || ""));

    const byId = Object.fromEntries(j.checks.map((c) => [c.id, c]));

    // Core checks
    if (!byId["llms-txt"].pass) fail("llms.txt should pass");
    if (!byId["robots"].pass) fail("robots should pass");
    if (!byId["sitemap"].pass) fail("sitemap should pass");
    if (!byId["structured-data"].pass) fail("JSON-LD should pass");
    if (!byId["meta"].pass) fail("meta should pass");
    if (!byId["openapi"].pass) fail("openapi should pass");
    if (!byId["well-known"].pass) fail("well-known should pass");
    if (!byId["mcp-manifest"].pass) fail("mcp-manifest should pass");
    if (!byId["feed"].pass) fail("feed should pass");
    if (byId["https"].pass) fail("https should FAIL on http://");
    if (typeof j.score !== "number") fail("score missing");
    if (!["A","B","C","D","F"].includes(j.grade)) fail("invalid grade: " + j.grade);

    // Verify category fields present
    for (const c of j.checks) {
      if (!c.category) fail("check missing category: " + c.id);
    }

    console.log(`OK — all assertions passed (score ${j.score}, grade ${j.grade}, ${j.checks.length} checks)`);
    process.exit(0);
  });
});
