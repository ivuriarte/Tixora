'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';

export default function OrganizerCtaSection() {
  const { isAuthenticated, isHydrating } = useAuthStore();

  if (isHydrating || isAuthenticated) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-700 px-8 py-12 text-center">
        <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-white/5" />

        <div className="relative">
          <span className="inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4 tracking-wide uppercase">
            For Organizers
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
            Ready to host your next event?
          </h2>
          <p className="text-violet-100 text-base sm:text-lg max-w-xl mx-auto mb-8">
            Join Axon Tickets and sell tickets to thousands of attendees across the Philippines. Get approved in 1–2 business days.
          </p>
          <Link
            href="/become-organizer"
            className="inline-flex items-center gap-2 bg-white text-violet-700 hover:bg-violet-50 font-semibold px-7 py-3.5 rounded-xl transition-colors text-base shadow-sm"
          >
            Apply as an organizer
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
