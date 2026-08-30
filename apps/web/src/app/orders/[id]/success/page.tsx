import Navbar from '@/components/Navbar';
import Footer from '@/components/marketing/Footer';
import ShareEventButton from '@/components/ShareEventButton';
import Link from 'next/link';

export default async function OrderSuccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <Navbar />
      <main className="bg-[#1a0533] px-4 py-14 text-white sm:px-6 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary" aria-hidden="true">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 4 4L19 6" /></svg>
          </div>
          <h1 className="axon-display mt-7 text-6xl text-white sm:text-8xl">You&apos;re In.</h1>
          <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-[#c4b5fd]">Payment confirmed. Your ticket has been sent to your email and is ready in My Events.</p>

          <div className="mx-auto mt-10 max-w-md rounded-lg border border-white/15 bg-white/5 p-5 text-left">
            <p className="axon-label text-[10px] text-[#a78bfa]">Order confirmed</p>
            <p className="mt-2 font-mono text-xs text-[#c4b5fd]">Reference {id.slice(-8).toUpperCase()}</p>
            <p className="mt-5 text-sm text-white">Your private QR ticket is only available in My Events and your confirmation email.</p>
          </div>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/account/tickets" className="axon-pill bg-white text-xs text-[#4C1D95] hover:bg-[#ede9fe]">View My Tickets</Link>
            <ShareEventButton title="I’m going to an event on Axon Tickets" text="Find your next event with Axon Tickets." url="/" className="axon-pill gap-2 border border-white/25 text-xs text-white hover:bg-white/10" />
            <Link href="/" className="axon-pill border border-white/25 text-xs text-white hover:bg-white/10">Browse Events</Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
