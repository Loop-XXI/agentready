"use client";

import { useState, useRef } from "react";
import styles from "./page.module.css";

type CheckResult = {
  id: string;
  label: string;
  weight: number;
  category: string;
  points: number;
  pass: boolean;
  partial?: boolean;
  detail?: string;
  fix?: string;
};

type AuditResult = {
  origin: string;
  version: string;
  score: number;
  grade: string;
  checks: CheckResult[];
  error?: string;
  aiFixes?: Record<string, string>;
};

function GradeBadge({ grade, score }: { grade: string; score: number }) {
  const color = grade === "A" || grade === "B" ? "#4ade80" : grade === "C" || grade === "D" ? "#fbbf24" : "#f87171";
  return (
    <div className={styles.gradeBadge} style={{ borderColor: color }}>
      <span className={styles.gradeScore} style={{ color }}>{score}</span>
      <span className={styles.gradeDivider}>/100</span>
      <span className={styles.gradeLetter} style={{ color }}>{grade}</span>
    </div>
  );
}

function CategoryLabel({ cat }: { cat: string }) {
  const labels: Record<string, string> = {
    discovery: "DISCOVERY", crawl: "CRAWL", metadata: "METADATA",
    api: "API", security: "SECURITY", content: "CONTENT", performance: "PERF",
  };
  return <span className={styles.catTag}>{labels[cat] || cat.toUpperCase()}</span>;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function runAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else { setResult(data); }
    } catch (err: unknown) {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function getAiFixes() {
    if (!result) return;
    setAiLoading(true);
    try {
      const failed = result.checks.filter((c) => !c.pass || c.partial);
      const res = await fetch("/api/ai-fixes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: result.origin, score: result.score, grade: result.grade, failed }),
      });
      const data = await res.json();
      setResult((prev) => prev ? { ...prev, aiFixes: data.fixes } : prev);
    } catch {
      // non-critical — AI unavailable
    } finally {
      setAiLoading(false);
    }
  }

  const failed = result?.checks.filter((c) => !c.pass || c.partial) ?? [];
  const passed = result?.checks.filter((c) => c.pass && !c.partial) ?? [];

  return (
    <main className={styles.main}>
      {/* Nav */}
      <nav className={styles.nav}>
        <a href="/" className={styles.wordmark}>
          <svg width="20" height="20" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="16" stroke="#e8e6df" strokeWidth="6" strokeLinecap="round" strokeDasharray="88 12" strokeDashoffset="-3"/>
            <circle cx="32" cy="32" r="5" fill="#e8e6df"/>
          </svg>
          <span>Loop<span className={styles.xxi}>XXI</span></span>
        </a>
        <a href="https://github.com/Loop-XXI/agentready" target="_blank" rel="noopener noreferrer" className={styles.navLink}>
          GitHub →
        </a>
      </nav>

      {/* Hero */}
      <header className={styles.hero}>
        <p className={styles.pill}>AI AGENT READINESS</p>
        <h1 className={styles.h1}>Is your site agent-ready?</h1>
        <p className={styles.lede}>
          Audit any URL against 15 checks — llms.txt, robots policy, structured data,
          OpenAPI, MCP manifest, and more. Get an instant score and AI-powered fixes.
        </p>
      </header>

      {/* Audit form */}
      <section className={styles.formSection}>
        <form onSubmit={runAudit} className={styles.form}>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yoursite.com"
            className={styles.input}
            autoComplete="off"
            spellCheck={false}
            disabled={loading}
          />
          <button type="submit" className={styles.btn} disabled={loading || !url.trim()}>
            {loading ? "Auditing…" : "Audit →"}
          </button>
        </form>

        {/* Error */}
        {error && <p className={styles.errorMsg}>{error}</p>}

        {/* Loading skeleton */}
        {loading && (
          <div className={styles.skeleton}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={styles.skRow} style={{ opacity: 1 - i * 0.08 }} />
            ))}
          </div>
        )}
      </section>

      {/* Results */}
      {result && !result.error && (
        <section className={styles.results}>
          <div className={styles.resultsHeader}>
            <div>
              <p className={styles.auditedUrl}>{result.origin}</p>
              <GradeBadge grade={result.grade} score={result.score} />
            </div>
            {failed.length > 0 && (
              <button onClick={getAiFixes} className={styles.aiBtn} disabled={aiLoading}>
                {aiLoading ? "Generating AI fixes…" : "✦ AI fix suggestions"}
              </button>
            )}
          </div>

          {/* Failed checks */}
          {failed.length > 0 && (
            <div className={styles.checkGroup}>
              <p className={styles.groupLabel}>TO IMPROVE</p>
              {failed.map((ch) => (
                <div key={ch.id} className={styles.checkRow}>
                  <div className={styles.checkTop}>
                    <span className={ch.partial ? styles.partialDot : styles.failDot}>
                      {ch.partial ? "◐" : "○"}
                    </span>
                    <span className={styles.checkLabel}>{ch.label}</span>
                    <CategoryLabel cat={ch.category} />
                    <span className={styles.checkWeight}>−{ch.weight - ch.points}pt</span>
                  </div>
                  <p className={styles.checkDetail}>{ch.detail}</p>
                  {(result.aiFixes?.[ch.id] || ch.fix) && (
                    <div className={styles.fixBox}>
                      <span className={styles.fixPill}>{result.aiFixes?.[ch.id] ? "AI" : "FIX"}</span>
                      <p className={styles.fixText}>{result.aiFixes?.[ch.id] || ch.fix}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Passed checks */}
          <div className={styles.checkGroup}>
            <p className={styles.groupLabel}>PASSING</p>
            {passed.map((ch) => (
              <div key={ch.id} className={`${styles.checkRow} ${styles.checkRowPass}`}>
                <div className={styles.checkTop}>
                  <span className={styles.passDot}>●</span>
                  <span className={styles.checkLabel}>{ch.label}</span>
                  <CategoryLabel cat={ch.category} />
                </div>
                <p className={styles.checkDetailMuted}>{ch.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* How it works */}
      {!result && !loading && (
        <section className={styles.howSection}>
          <p className={styles.groupLabel}>WHAT WE CHECK</p>
          <div className={styles.checkGrid}>
            {[
              ["llms.txt", "The #1 signal — does your site have an LLM index file?"],
              ["robots.txt + AI policy", "Are AI crawlers explicitly allowed or blocked?"],
              ["Sitemap", "Can agents enumerate your pages?"],
              ["JSON-LD / structured data", "Can agents extract facts without scraping prose?"],
              ["OpenAPI spec", "Can agents drive your API without custom integration?"],
              ["MCP manifest", "Are your tools discoverable via Model Context Protocol?"],
              [".well-known surface", "Security contact, AI plugin manifest."],
              ["Title + OG tags", "The first thing an agent reads about your site."],
              ["RSS/Atom feed", "Agents monitor feeds far better than re-scraping."],
              ["HTTPS + speed", "Are you accessible within agent timeouts?"],
            ].map(([title, desc]) => (
              <div key={title} className={styles.checkCard}>
                <p className={styles.checkCardTitle}>{title}</p>
                <p className={styles.checkCardDesc}>{desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className={styles.footer}>
        <span>
          agentready by{" "}
          <a href="https://loopxxi.com" className={styles.footerLink}>Loop XXI</a>
          {" — "}technology that compounds.
        </span>
        <a href="https://github.com/Loop-XXI/agentready" className={styles.footerLink} target="_blank" rel="noopener noreferrer">
          open source
        </a>
      </footer>
    </main>
  );
}
