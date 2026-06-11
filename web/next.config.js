// @ts-check
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
};

module.exports = withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  org: "loop-xxi",
  project: "agentready",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
