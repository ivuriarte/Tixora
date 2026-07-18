import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/marketing/Footer';
import { USER_TERMS } from '@/lib/legal';

export const metadata: Metadata = { title: 'Terms & Conditions — Axon Tickets' };

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="page-container py-12 md:py-16">
        <p className="axon-label text-xs text-primary">Legal</p>
        <h1 className="axon-display mt-4 text-4xl md:text-6xl">Terms &amp; Conditions</h1>
        <article className="mt-10 max-w-4xl whitespace-pre-wrap text-sm leading-7 text-[#6b5b8a]">{USER_TERMS}</article>
      </main>
      <Footer />
    </>
  );
}
