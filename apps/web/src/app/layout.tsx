import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import SentryInit from '@/components/SentryInit';

const inter = Inter({ subsets: ['latin'], display: 'swap', weight: ['400', '500', '600', '700'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Axon Tickets — Online Ticketing Philippines',
  description: 'Buy tickets to the best events in the Philippines. Fast, secure, mobile-first.',
  openGraph: {
    title: 'Axon Tickets',
    description: 'Buy tickets to the best events in the Philippines.',
    siteName: 'Axon Tickets',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <SentryInit />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
