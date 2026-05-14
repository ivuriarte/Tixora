import Navbar from '@/components/Navbar';
import Link from 'next/link';

export default function OrderSuccessPage({ params }: { params: { id: string } }) {
  return (
    <>
      <Navbar />
      <main className="max-w-lg mx-auto px-4 py-20 text-center space-y-6">
        <div className="text-6xl">🎉</div>
        <h1 className="text-2xl font-bold text-gray-900">Payment Successful!</h1>
        <p className="text-gray-500">
          Your tickets are confirmed. Check your email for the confirmation.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/account/tickets"
            className="bg-primary text-white font-semibold px-6 py-3 rounded-xl hover:bg-primary-hover transition-colors"
          >
            View My Tickets
          </Link>
          <Link
            href="/"
            className="border border-gray-300 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:border-gray-400 transition-colors"
          >
            Browse Events
          </Link>
        </div>
      </main>
    </>
  );
}
