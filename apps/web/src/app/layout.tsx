import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'], display: 'swap', weight: ['400', '500', '600', '700'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4C1D95',
};

export const metadata: Metadata = {
  title: 'Axon Tickets — Online Ticketing Philippines',
  description: 'Buy tickets to the best events in the Philippines. Fast, secure, mobile-first.',
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-512.png',   sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Axon Tickets',
    description: 'Buy tickets to the best events in the Philippines.',
    siteName: 'Axon Tickets',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Axon Tickets' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Axon Tickets',
    description: 'Buy tickets to the best events in the Philippines.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const showAnalytics = process.env.NODE_ENV === 'production';

  return (
    <html lang="en" className={inter.className}>
      <body>
        <Providers>{children}</Providers>
        {showAnalytics ? <Analytics /> : null}
      </body>
    </html>
  );
}
