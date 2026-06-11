"use strict";
/**
 * lib/checks.js — shared audit engine for CLI + Vercel API
 * Exported: { audit, probe, normalizeOrigin, grade, VERSION }
 * Zero dependencies. Node 18+ (built-in fetch).
 */

const VERSION = "0.2.0";
const AGENT_UA = "agentready/" + VERSION + " (+https://github.com/Loop-XXI/agentready)";

// ---------- probe ----------

async function probe(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || 8000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": AGENT_UA, ...(opts.headers || {}) },
      method: opts.method || "GET",
    });
    const text = opts.skipBody ? "" : await res.text();
    return { ok: res.ok, status: res.status, text, headers: res.headers, url: res.url };
  } catch (e) {
    return { ok: false, status: 0, text: "", headers: new Map(), error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeOrigin(input) {
  let u = input.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { return new URL(u).origin; } catch { return null; }
}

const KNOWN_AI_BOTS = [
  "GPTBot", "ClaudeBot", "Claude-Web", "anthropic-ai", "PerplexityBot",
  "Google-Extended", "Applebot-Extended", "CCBot", "cohere-ai", "Bytespider",
];

// ---------- checks ----------
// Each: { id, label, weight, category, run(origin, ctx) -> { pass, detail, fix? } }

const checks = [
  {
    id: "llms-txt",
    label: "llms.txt",
    weight: 20,
    category: "discovery",
    async run(origin) {
      const r = await probe(origin + "/llms.txt");
      const isText = r.ok && !/<\s*(!doctype|html)/i.test(r.text.slice(0, 200));
      if (isText && r.text.trim().length > 0) {
        const lines = r.text.trim().split("\n").length;
        const hasLinks = /\[[^\]]+\]\([^)]+\)/.test(r.text) || /https?:\/\//.test(r.text);
        return {
          pass: true, partial: !hasLinks,
          detail: `present (${lines} lines${hasLinks ? ", contains links" : ""})`,
          ...(!hasLinks ? { fix: "llms.txt exists but has no links — add markdown links to your key docs/pages." } : {}),
        };
      }
      return {
        pass: false,
        detail: r.status ? `missing (HTTP ${r.status})` : "missing (unreachable)",
        fix: "Add /llms.txt — a markdown index of your site for LLMs. Spec: llmstxt.org. This is the single highest-leverage file for agent discoverability.",
      };
    },
  },
  {
    id: "llms-full",
    label: "llms-full.txt",
    weight: 5,
    category: "discovery",
    async run(origin) {
      const r = await probe(origin + "/llms-full.txt");
      const isText = r.ok && !/<\s*(!doctype|html)/i.test(r.text.slice(0, 200));
      if (isText && r.text.trim().length > 0) {
        const kb = Math.round(r.text.length / 1024);
        return { pass: true, detail: `present (~${kb} KB)` };
      }
      return {
        pass: false, detail: "missing",
        fix: "Optional: add /llms-full.txt with full flattened content so agents can ingest your whole site in one request.",
      };
    },
  },
  {
    id: "robots",
    label: "robots.txt",
    weight: 10,
    category: "crawl",
    async run(origin, ctx) {
      // Use pre-fetched value from ctx if available
      const robotsText = ctx.robotsText;
      if (robotsText === null) {
        return {
          pass: false, detail: "missing (HTTP 404+)",
          fix: "Add /robots.txt. Without it, agent crawlers guess — and some will skip you.",
        };
      }
      const blockedAll = /User-agent:\s*\*\s*[\r\n]+(?:[^\S\r\n]*Disallow:\s*\/\s*$)/im.test(robotsText);
      if (blockedAll) {
        return {
          pass: false, detail: "present but disallows everything for *",
          fix: "robots.txt blocks all crawlers — agents respecting it cannot read your site at all.",
        };
      }
      return { pass: true, detail: "present, crawlable" };
    },
  },
  {
    id: "ai-bot-policy",
    label: "AI crawler policy",
    weight: 5,
    category: "crawl",
    async run(origin, ctx) {
      const robots = ctx.robotsText || "";
      const mentioned = KNOWN_AI_BOTS.filter((b) =>
        new RegExp("User-agent:\\s*" + b, "i").test(robots)
      );
      const blocked = mentioned.filter((b) => {
        const re = new RegExp("User-agent:\\s*" + b + "[\\s\\S]*?Disallow:\\s*\\/\\s*(?=$|[\\r\\n])", "i");
        return re.test(robots);
      });
      if (blocked.length > 0) {
        return {
          pass: false,
          detail: `blocks AI agents: ${blocked.join(", ")}`,
          fix: "You explicitly block AI crawlers. Remove these Disallow rules if you want agents to see your content.",
        };
      }
      if (mentioned.length > 0) {
        return { pass: true, detail: `explicit policy for ${mentioned.length} AI bot(s), none fully blocked` };
      }
      return { pass: true, detail: "no AI-specific blocks (default-open)" };
    },
  },
  {
    id: "sitemap",
    label: "sitemap",
    weight: 10,
    category: "crawl",
    async run(origin, ctx) {
      const m = (ctx.robotsText || "").match(/Sitemap:\s*(\S+)/i);
      const candidates = m ? [m[1]] : [origin + "/sitemap.xml"];
      for (const u of candidates) {
        const r = await probe(u);
        if (r.ok && /<(urlset|sitemapindex)/i.test(r.text)) {
          const count = (r.text.match(/<loc>/g) || []).length;
          return { pass: true, detail: `present (${count} <loc> entries${m ? ", declared in robots.txt" : ""})` };
        }
      }
      return {
        pass: false, detail: "missing",
        fix: "Add /sitemap.xml and declare it in robots.txt — it tells agents how to enumerate your pages.",
      };
    },
  },
  {
    id: "structured-data",
    label: "structured data (JSON-LD)",
    weight: 10,
    category: "metadata",
    async run(origin, ctx) {
      const home = ctx.home;
      if (!home || !home.ok) return { pass: false, detail: "home page unreachable", fix: "Site must serve a 200 home page." };
      const blocks = home.text.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
      if (blocks.length === 0) {
        return {
          pass: false, detail: "none found on home page",
          fix: "Add JSON-LD (schema.org) — at minimum an Organization or WebSite block. Agents use it to extract facts without scraping prose.",
        };
      }
      const types = [];
      for (const b of blocks) {
        try {
          const json = JSON.parse(b.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, ""));
          const t = json["@type"] || (Array.isArray(json) && json[0] && json[0]["@type"]);
          if (t) types.push(Array.isArray(t) ? t.join("+") : t);
        } catch { /* unparseable */ }
      }
      return { pass: true, detail: `${blocks.length} block(s)${types.length ? ": " + types.join(", ") : ""}` };
    },
  },
  {
    id: "meta",
    label: "title + meta description",
    weight: 10,
    category: "metadata",
    async run(origin, ctx) {
      const home = ctx.home;
      if (!home || !home.ok) return { pass: false, detail: "home page unreachable", fix: "Site must serve a 200 home page." };
      const title = (home.text.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
      const desc =
        (home.text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
         home.text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) || [])[1];
      if (title && desc) return { pass: true, detail: `title "${title.trim().slice(0, 50)}", description present` };
      const missing = [!title && "title", !desc && "meta description"].filter(Boolean).join(" + ");
      return {
        pass: false, detail: `missing ${missing}`,
        fix: `Add ${missing}. It's the first (sometimes only) thing an agent reads about a page.`,
      };
    },
  },
  {
    id: "open-graph",
    label: "Open Graph tags",
    weight: 5,
    category: "metadata",
    async run(origin, ctx) {
      const home = ctx.home;
      if (!home || !home.ok) return { pass: false, detail: "home page unreachable" };
      const og = (home.text.match(/property=["']og:[a-z:]+["']/gi) || []).length;
      if (og >= 2) return { pass: true, detail: `${og} og: tags` };
      return {
        pass: false, detail: og ? "only 1 og: tag" : "none",
        fix: "Add og:title / og:description / og:url — agents and link unfurlers both read them.",
      };
    },
  },
  {
    id: "openapi",
    label: "API discoverability (OpenAPI)",
    weight: 10,
    category: "api",
    async run(origin) {
      const paths = ["/openapi.json", "/openapi.yaml", "/swagger.json", "/.well-known/openapi.json", "/api/openapi.json"];
      for (const p of paths) {
        const r = await probe(origin + p);
        if (r.ok && (r.text.includes("openapi") || r.text.includes("swagger"))) {
          return { pass: true, detail: `found at ${p}` };
        }
      }
      return {
        pass: false, detail: "no OpenAPI spec found at common paths",
        fix: "If you have an API, publish its OpenAPI spec at /openapi.json — agents can drive a documented API without custom integration.",
      };
    },
  },
  {
    id: "well-known",
    label: ".well-known surface",
    weight: 5,
    category: "security",
    async run(origin) {
      const found = [];
      for (const p of ["/.well-known/security.txt", "/.well-known/ai-plugin.json"]) {
        const r = await probe(origin + p);
        const isHtml = /<\s*(!doctype|html)/i.test(r.text.slice(0, 200));
        if (r.ok && r.text.trim() && !isHtml) found.push(p.split("/").pop());
      }
      if (found.length) return { pass: true, detail: found.join(", ") };
      return {
        pass: false, detail: "none",
        fix: "Add /.well-known/security.txt (contact info, RFC 9116). Cheap trust signal for both humans and agents.",
      };
    },
  },
  {
    id: "mcp-manifest",
    label: "MCP tool manifest",
    weight: 5,
    category: "api",
    async run(origin) {
      const paths = ["/.well-known/mcp.json", "/mcp.json", "/.well-known/ai-plugin.json"];
      for (const p of paths) {
        const r = await probe(origin + p);
        const isHtml = /<\s*(!doctype|html)/i.test(r.text.slice(0, 200));
        if (r.ok && r.text.trim() && !isHtml) {
          try { JSON.parse(r.text); return { pass: true, detail: `found at ${p}` }; } catch { /**/ }
        }
      }
      return {
        pass: false, detail: "no MCP/plugin manifest",
        fix: "Add /.well-known/mcp.json to describe your tools for the Model Context Protocol — lets agents discover and use your APIs automatically.",
      };
    },
  },
  {
    id: "feed",
    label: "RSS/Atom feed",
    weight: 5,
    category: "content",
    async run(origin, ctx) {
      const home = ctx.home;
      const linked = home && home.ok && /<link[^>]+type=["']application\/(rss|atom)\+xml["']/i.test(home.text);
      if (linked) return { pass: true, detail: "feed declared in <head>" };
      for (const p of ["/feed", "/rss.xml", "/atom.xml", "/feed.xml", "/index.xml"]) {
        const r = await probe(origin + p);
        if (r.ok && /<(rss|feed)[\s>]/i.test(r.text)) return { pass: true, detail: `found at ${p}` };
      }
      return {
        pass: false, detail: "none found",
        fix: "If you publish content, add an RSS/Atom feed — agents monitor feeds far more reliably than re-scraping pages.",
      };
    },
  },
  {
    id: "content-negotiation",
    label: "markdown content negotiation",
    weight: 5,
    category: "content",
    async run(origin) {
      const r = await probe(origin + "/", { headers: { Accept: "text/markdown" } });
      const ct = (r.headers && r.headers.get && r.headers.get("content-type")) || "";
      if (r.ok && /markdown|text\/plain/.test(ct)) {
        return { pass: true, detail: `serves ${ct.split(";")[0]} on request` };
      }
      return {
        pass: false, detail: "HTML only",
        fix: "Optional (cutting-edge): respond to 'Accept: text/markdown' with a markdown version. Agents skip the HTML parse entirely.",
      };
    },
  },
  {
    id: "perf",
    label: "response speed",
    weight: 5,
    category: "performance",
    async run(origin, ctx) {
      const t = ctx.homeMs;
      if (t == null) return { pass: false, detail: "unmeasured" };
      if (t < 1500) return { pass: true, detail: `${t} ms` };
      return {
        pass: false, detail: `${t} ms (slow)`,
        fix: "Home page took >1.5s. Agents run on timeouts; slow sites get dropped from agent workflows.",
      };
    },
  },
  {
    id: "https",
    label: "HTTPS",
    weight: 5,
    category: "security",
    async run(origin, ctx) {
      if (origin.startsWith("https://") && ctx.home && ctx.home.ok) return { pass: true, detail: "valid" };
      return { pass: false, detail: "not serving valid HTTPS", fix: "Serve over HTTPS — most agent stacks refuse plain HTTP." };
    },
  },
];

// ---------- grade ----------

function grade(score) {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

// ---------- audit ----------
// Returns plain data — no console output.

async function audit(input) {
  const origin = normalizeOrigin(input);
  if (!origin) return { error: "invalid URL: " + input };

  // Pre-fetch shared resources in parallel
  const ctx = {};
  const t0 = Date.now();
  const [homeRes, robotsRes] = await Promise.all([
    probe(origin + "/"),
    probe(origin + "/robots.txt"),
  ]);
  ctx.home = homeRes;
  ctx.homeMs = Date.now() - t0;
  ctx.robotsText = robotsRes.ok ? robotsRes.text : null;

  if (ctx.home.status === 0) {
    return { origin, version: VERSION, error: "unreachable: " + (ctx.home.error || "network error") };
  }

  // Run all checks in parallel (shared ctx is pre-populated)
  const entries = await Promise.all(
    checks.map(async (ch) => {
      let r;
      try { r = await ch.run(origin, ctx); }
      catch (e) { r = { pass: false, detail: "check error: " + e.message }; }
      const pts = r.pass ? (r.partial ? Math.round(ch.weight / 2) : ch.weight) : 0;
      return {
        id: ch.id, label: ch.label, weight: ch.weight, category: ch.category,
        points: pts, ...r,
      };
    })
  );

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const earned = entries.reduce((s, e) => s + e.points, 0);
  const score = Math.round((earned / total) * 100);

  return { origin, version: VERSION, score, grade: grade(score), checks: entries };
}

module.exports = { audit, probe, normalizeOrigin, grade, VERSION, checks, KNOWN_AI_BOTS };
