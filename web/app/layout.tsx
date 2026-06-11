import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "agentready — AI agent readiness auditor",
  description:
    "Instantly audit any website for AI-agent readiness: llms.txt, robots policy, structured data, OpenAPI, and more. Get an instant score + AI-powered fix suggestions.",
  openGraph: {
    title: "agentready — AI agent readiness auditor",
    description:
      "Audit any website for AI-agent readiness. Instant score + AI-powered fix suggestions.",
    url: "https://agentready.loopxxi.com",
    siteName: "agentready by Loop XXI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "agentready — AI agent readiness auditor",
    description: "Instant score + AI-powered fix suggestions for any URL.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "agentready",
            "url": "https://agentready.loopxxi.com",
            "description": "Audit any website for AI-agent readiness. Instant score + AI-powered fix suggestions.",
            "applicationCategory": "DeveloperApplication",
            "operatingSystem": "Web",
            "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
            "author": { "@type": "Organization", "name": "Loop XXI", "url": "https://loopxxi.com" }
          })}}
        />
        <link
          rel="icon"
          href='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="16" fill="none" stroke="%23e8e6df" stroke-width="6" stroke-linecap="round" stroke-dasharray="88 12" stroke-dashoffset="-3"/><circle cx="32" cy="32" r="5" fill="%23e8e6df"/></svg>'
        />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#0a0a0a", color: "#e8e6df" }}>
        {children}
      </body>
    </html>
  );
}
