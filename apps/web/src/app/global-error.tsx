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
          fontFamily: 'system-ui, sans-serif',
          gap: '16px',
        }}
      >
        <h2 style={{ margin: 0 }}>Something went wrong</h2>
        <button
          onClick={reset}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
