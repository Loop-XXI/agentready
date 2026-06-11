import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://964358b09acda428c067c9dc0eac17f7@o4511436293734400.ingest.us.sentry.io/4511541128396800",
  tracesSampleRate: 1.0,
  debug: false,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [
    Sentry.replayIntegration(),
  ],
});
