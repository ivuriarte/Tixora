import Navbar from '@/components/Navbar';
import Link from 'next/link';

export default function OrderFailedPage({ params }: { params: { id: string } }) {
  return (
    <>
      <Navbar />
      <main className="max-w-lg mx-auto px-4 py-20 text-center space-y-6">
        <div className="text-6xl">😞</div>
        <h1 className="text-2xl font-bold text-gray-900">Payment Failed</h1>
        <p className="text-gray-500">
          Your payment was not completed. No charge was made. Please try again.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="bg-primary text-white font-semibold px-6 py-3 rounded-xl hover:bg-primary-hover transition-colors"
          >
            Browse Events
          </Link>
        </div>
      </main>
    </>
  );
}
