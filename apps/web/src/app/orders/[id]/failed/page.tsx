import Navbar from '@/components/Navbar';
import Link from 'next/link';
import Footer from '@/components/marketing/Footer';

export default function OrderFailedPage({ params }: { params: { id: string } }) {
  return (
    <>
      <Navbar />
      <main className="flex min-h-[72vh] items-center bg-[#1a0533] px-4 py-20 text-center text-white">
        <div className="mx-auto max-w-lg space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-red-300" aria-hidden="true"><svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg></div>
        <h1 className="axon-display text-4xl sm:text-6xl">Payment failed</h1>
        <p className="text-[#c4b5fd]">
          Your payment was not completed. No charge was made. Please try again.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="axon-pill bg-primary text-sm text-white hover:bg-primary-hover"
          >
            Browse Events
          </Link>
        </div></div>
      </main>
      <Footer />
    </>
  );
}
