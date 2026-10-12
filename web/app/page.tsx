"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import styles from "./page.module.css";

type CheckResult = {
  id: string; label: string; weight: number; category: string;
  points: number; pass: boolean; partial?: boolean; detail?: string; fix?: string;
};
type AuditResult = {
  origin: string; version: string; score: number; grade: string;
  checks: CheckResult[]; error?: string; aiFixes?: Record<string, string>; aiTier?: string;
};
type PayState = "idle" | "requesting" | "awaiting" | "paid" | "error";

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

function LightningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }}>
      <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" />
    </svg>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} className={styles.copyBtn}>
      {copied ? "✓ copied" : "copy"}
    </button>
  );
}

function PaymentModal({
  origin, onPaid, onClose,
}: { origin: string; onPaid: (entitlement: string) => void; onClose: () => void }) {
  const [payState, setPayState] = useState<PayState>("requesting");
  const [invoice, setInvoice] = useState("");
  const [paymentHash, setPaymentHash] = useState("");
  const [amountSat, setAmountSat] = useState(21);
  const [expiresAt, setExpiresAt] = useState(0);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Request invoice on mount
  useEffect(() => {
    fetch("/api/pay/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin }),
    })
      .then((r) => r.json())
      .then((d: { invoice?: string; paymentHash?: string; amountSat?: number; expiresAt?: number; error?: string }) => {
        if (d.error) { setError(d.error); setPayState("error"); return; }
        setInvoice(d.invoice ?? "");
        setPaymentHash(d.paymentHash ?? "");
        setAmountSat(d.amountSat ?? 21);
        setExpiresAt(d.expiresAt ?? 0);
        setPayState("awaiting");
      })
      .catch(() => { setError("Could not reach Lightning node"); setPayState("error"); });
  }, [origin]);

  // Poll for payment
  const startPolling = useCallback((hash: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (!hash) return;
      try {
        const r = await fetch(`/api/pay/check?paymentHash=${hash}`);
        const d = await r.json() as { paid?: boolean; entitlement?: string };
        if (d.paid && d.entitlement) {
          clearInterval(pollRef.current!);
          setPayState("paid");
          const entitlement = d.entitlement;
          setTimeout(() => onPaid(entitlement), 800);
        }
      } catch { /* keep polling */ }
    }, 2000);
  }, [onPaid]);

  useEffect(() => {
    if (payState === "awaiting" && paymentHash) startPolling(paymentHash);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [payState, paymentHash, startPolling]);

  const secondsLeft = expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 1000)) : 0;
  const walletLink = invoice ? `lightning:${invoice.toLowerCase()}` : "";

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>
            <LightningIcon /> Pay {amountSat} sats for AI fixes
          </span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        {payState === "requesting" && (
          <div className={styles.modalBody}>
            <div className={styles.skRow} style={{ height: 32, marginBottom: 12 }} />
            <div className={styles.skRow} style={{ height: 80 }} />
          </div>
        )}

        {payState === "error" && (
          <div className={styles.modalBody}>
            <p className={styles.errorMsg}>{error || "Lightning unavailable"}</p>
          </div>
        )}

        {payState === "awaiting" && (
          <div className={styles.modalBody}>
            <p className={styles.modalLede}>
              Scan with any Lightning wallet, or pay from a BOLT11-compatible app.
            </p>
            <div className={styles.invoiceBox}>
              <p className={styles.invoiceText}>{invoice.slice(0, 60)}…</p>
              <CopyButton text={invoice} />
            </div>
            {walletLink && (
              <a href={walletLink} className={styles.walletBtn}>
                <LightningIcon /> Open in wallet app
              </a>
            )}
            <div className={styles.pollRow}>
              <span className={styles.pollDot} />
              <span className={styles.pollLabel}>Waiting for payment…</span>
              {secondsLeft > 0 && (
                <span className={styles.expiry}>{secondsLeft}s</span>
              )}
            </div>
            <p className={styles.modalNote}>
              21 sats ≈ {(21 * 0.000001 * 105000).toFixed(4)} USD · one-time, non-recurring
            </p>
          </div>
        )}

        {payState === "paid" && (
          <div className={styles.modalBody}>
            <div className={styles.paidBadge}>⚡ Payment received — generating AI fixes…</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function runAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json() as AuditResult;
      if (data.error) setError(data.error);
      else setResult(data);
    } catch { setError("Network error — please try again."); }
    finally { setLoading(false); }
  }

  async function fetchAiFixes(entitlement?: string) {
    if (!result) return;
    setAiLoading(true);
    setShowPayModal(false);
    try {
      const failed = result.checks.filter((c) => !c.pass || c.partial);
      const res = await fetch("/api/ai-fixes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: result.origin,
          score: result.score,
          grade: result.grade,
          failed,
          entitlement: entitlement ?? "",
        }),
      });
      const data = await res.json() as { fixes?: Record<string, string>; paid?: boolean; tier?: string };
      setResult((prev) => prev
        ? { ...prev, aiFixes: data.fixes, aiTier: data.tier }
        : prev
      );
    } catch { /* non-critical */ }
    finally { setAiLoading(false); }
  }

  const failed = result?.checks.filter((c) => !c.pass || c.partial) ?? [];
  const passed  = result?.checks.filter((c) => c.pass && !c.partial) ?? [];
  const hasPaidFixes = result?.aiTier === "ai" || result?.aiTier === "ai-fallback";

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
        {error && <p className={styles.errorMsg}>{error}</p>}
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
              <div className={styles.aiActions}>
                {!hasPaidFixes ? (
                  <>
                    <button
                      onClick={() => setShowPayModal(true)}
                      className={styles.aiBtn}
                      disabled={aiLoading}
                    >
                      <LightningIcon />
                      {aiLoading ? "Generating…" : "21 sats — AI fixes"}
                    </button>
                    <button
                      onClick={() => fetchAiFixes()}
                      className={styles.aiBtnFree}
                      disabled={aiLoading}
                    >
                      {aiLoading ? "…" : "Free hints"}
                    </button>
                  </>
                ) : (
                  <span className={styles.paidTag}>⚡ AI fixes active</span>
                )}
              </div>
            )}
          </div>

          {/* Failed checks */}
          {failed.length > 0 && (
            <div className={styles.checkGroup}>
              <p className={styles.groupLabel}>TO IMPROVE</p>
              {failed.map((ch) => (
                <div key={ch.id} className={styles.checkRow}>
                  <div className={styles.checkTop}>
                    <span className={ch.partial ? styles.partialDot : styles.failDot}>{ch.partial ? "◐" : "○"}</span>
                    <span className={styles.checkLabel}>{ch.label}</span>
                    <CategoryLabel cat={ch.category} />
                    <span className={styles.checkWeight}>−{ch.weight - ch.points}pt</span>
                  </div>
                  <p className={styles.checkDetail}>{ch.detail}</p>
                  {(result.aiFixes?.[ch.id] || ch.fix) && (
                    <div className={styles.fixBox}>
                      <span className={styles.fixPill}>{hasPaidFixes ? "⚡ AI" : "FIX"}</span>
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
              ["RSS/Atom feed", "Agents monitor feeds better than re-scraping."],
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
        <span>agentready by <a href="https://loopxxi.com" className={styles.footerLink}>Loop XXI</a> — technology that compounds.</span>
        <a href="https://github.com/Loop-XXI/agentready" className={styles.footerLink} target="_blank" rel="noopener noreferrer">open source</a>
      </footer>

      {/* Lightning payment modal */}
      {showPayModal && result && (
        <PaymentModal
          origin={result.origin}
          onPaid={(entitlement) => fetchAiFixes(entitlement)}
          onClose={() => setShowPayModal(false)}
        />
      )}
    </main>
  );
}
