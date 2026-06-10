# agentready

**Audit any website for AI-agent readiness.**

The web is getting a second audience: AI agents that browse, read, and act on behalf of people. Most sites are built for humans and Google — and are nearly invisible to this new audience. `agentready` tells you, in five seconds, how your site looks to an agent and exactly what to fix.

```
$ npx agentready yoursite.com

  agentready v0.1.0  →  https://yoursite.com

  ● llms.txt                      present (12 lines, contains links)
  ● robots.txt                    present, crawlable
  ● AI crawler policy             no AI-specific blocks (default-open)
  ● sitemap                       present (48 <loc> entries)
  ○ structured data (JSON-LD)     none found on home page
  ● title + meta description      title "Your Site", description present
  ● Open Graph tags               6 og: tags
  ○ API discoverability (OpenAPI) no OpenAPI spec found at common paths
  ○ .well-known surface           none
  ● RSS/Atom feed                 found at /feed.xml
  ○ markdown content negotiation  HTML only
  ● response speed                240 ms
  ● HTTPS                         valid

  score 68/100  (C)

  to improve:
  · Add JSON-LD (schema.org) — at minimum an Organization or WebSite block.
  · If you have an API, publish its OpenAPI spec at /openapi.json.
  · Add /.well-known/security.txt (contact info, RFC 9116).
```

## Install

No install needed:

```bash
npx agentready example.com
```

Or globally:

```bash
npm install -g agentready
agentready example.com
```

Requires Node 18+. **Zero dependencies.**

## What it checks

| Check | Why it matters to agents |
|---|---|
| `llms.txt` / `llms-full.txt` | The emerging standard ([llmstxt.org](https://llmstxt.org)) for telling LLMs what your site is and where the good stuff lives |
| `robots.txt` + AI crawler policy | Whether GPTBot, ClaudeBot, PerplexityBot & co. are allowed in — or explicitly blocked |
| Sitemap | How agents enumerate your pages without guessing URLs |
| JSON-LD structured data | Lets agents extract facts without parsing prose |
| Title / meta / Open Graph | The first (sometimes only) thing an agent reads about a page |
| OpenAPI spec discovery | A documented API is the difference between "agents can scrape you" and "agents can *use* you" |
| `.well-known` surface | security.txt and other machine-readable trust signals |
| RSS/Atom feeds | Agents monitor feeds far more reliably than they re-scrape pages |
| Markdown content negotiation | Cutting-edge: serving `text/markdown` on request lets agents skip HTML parsing entirely |
| HTTPS + response speed | Agents run on timeouts; slow or insecure sites get dropped from workflows |

## Machine-readable output

Agents auditing sites for their humans (we see you 👋):

```bash
agentready example.com --json
```

Returns the full check list with ids, weights, points, and fix suggestions.

## CI

Exit code is `0` when the score is ≥ 60, `1` otherwise:

```yaml
# .github/workflows/agentready.yml
- run: npx agentready yoursite.com
```

## Scoring

Weighted: `llms.txt` (20), robots/sitemap/JSON-LD/meta/OpenAPI (10 each), the rest (5 each). Grades: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, else F. Weights are opinionated and will evolve with the ecosystem — PRs welcome.

## Why

We build everything agent-accessible from day one, and kept needing a quick way to answer "can an agent actually use this site?" Nothing did the whole job, so we made the checklist executable.

Built by [Loop XXI](https://loopxxi.com).

## License

MIT
