// Sentry browser-side initialization — Next.js + @sentry/nextjs v10 convention.
// This file is automatically loaded by Next.js on the client. No manual import needed.
// See: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
import * as Sentry from '@sentry/nextjs';
import { scrubBreadcrumbData, scrubRequestUrl } from './lib/scrubUrls';

// ── Reservation links keep a secret in the URL fragment (#t=… or #r=…) ─────────────────
// This file runs before any other client code, so on the resume page the fragment is
// moved out of the address bar BEFORE Sentry, the Meta Pixel or analytics start and could
// record it. The page reads it back from `window.__axonResumeFragment` (or sessionStorage).
const RESUME_PATH = /^\/events\/[^/]+\/register\/resume\/?$/;
if (typeof window !== 'undefined' && RESUME_PATH.test(window.location.pathname) && window.location.hash) {
  const fragment = window.location.hash;
  (window as unknown as { __axonResumeFragment?: string }).__axonResumeFragment = fragment;
  try {
    window.sessionStorage.setItem('axon_resume_fragment', fragment);
  } catch {
    // Storage can be blocked (private windows, in-app browsers); the window global still works.
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
// Deployed environments (UAT and production) report to Sentry; local development does not.
const appEnv = process.env.NEXT_PUBLIC_APP_ENV;
const isDeployed = appEnv === 'production' || appEnv === 'uat';

if (dsn) {
  Sentry.init({
    dsn,
    // Capture 10% of traces in production — raise when comfortable with volume
    tracesSampleRate: isDeployed ? 0.1 : 1.0,
    // Replay deliberately disabled for now — re-enable after baseline event flow is verified
    // Capture 100% of sessions where an error occurs, 1% of normal browsing
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.01,
    integrations: [Sentry.replayIntegration()],
    enabled: isDeployed,
    // Defence in depth: no event, transaction or navigation breadcrumb may carry a fragment.
    beforeSend(event) {
      scrubRequestUrl(event.request);
      return event;
    },
    beforeSendTransaction(event) {
      scrubRequestUrl(event.request);
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubBreadcrumbData(breadcrumb);
    },
  });
}

// Required export for Next.js — fires on navigation, used for Sentry tracing
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
