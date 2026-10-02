import type { Metadata } from 'next';

// A private, token-bearing page: never indexed, never sends a referrer. The matching
// response headers (X-Robots-Tag, Referrer-Policy, Cache-Control) are set in next.config.mjs.
export const metadata: Metadata = {
  title: 'Resuming your reservation | Axon Tickets',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ResumeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
