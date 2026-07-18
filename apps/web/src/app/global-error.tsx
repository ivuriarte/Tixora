'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// global-error.tsx replaces the root layout when an uncaught error bubbles to
// the top of the React tree. Sentry requires this file to capture render errors.
// See: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#react-render-errors-in-app-router

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          gap: '16px',
          padding: '24px',
          background: '#1a0533',
          color: '#ffffff',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0, color: '#a78bfa', fontSize: '12px', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Axon Tickets</p>
        <h2 style={{ margin: 0, fontSize: 'clamp(32px, 8vw, 64px)', fontWeight: 900, lineHeight: .95, letterSpacing: '-.02em', textTransform: 'uppercase' }}>Something went wrong</h2>
        <p style={{ margin: 0, maxWidth: '520px', color: '#c4b5fd', lineHeight: 1.6 }}>We couldn’t load this screen. Your information is safe—try the page again.</p>
        <button
          onClick={reset}
          style={{
            minHeight: '44px',
            padding: '0 24px',
            borderRadius: '40px',
            border: '1px solid #a78bfa',
            background: '#7c3aed',
            color: '#fff',
            fontWeight: 700,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
