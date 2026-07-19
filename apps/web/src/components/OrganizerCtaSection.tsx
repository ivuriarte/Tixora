'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';

interface OrganizerCtaSectionProps {
  heading?: string;
  description?: string;
  buttonLabel?: string;
  buttonHref?: string;
  dataTrack?: string;
  hideWhenAuthenticated?: boolean;
  feeNote?: string;
}

export default function OrganizerCtaSection({
  heading = 'Ready to host your next event?',
  description = 'Join organizers across the Philippines running events the modern way — from Davao to Manila.',
  buttonLabel = 'Apply as an organizer',
  buttonHref = '/become-organizer',
  dataTrack,
  hideWhenAuthenticated = true,
  feeNote,
}: OrganizerCtaSectionProps) {
  const { isAuthenticated, isHydrating } = useAuthStore();

  if (hideWhenAuthenticated && (isHydrating || isAuthenticated)) return null;

  return (
    <section className="bg-[#1a0533] px-4 py-16 text-center text-white sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-4xl">
          <span className="axon-label mb-5 inline-block rounded-full border border-primary-900 px-3 py-1 text-xs text-[#a78bfa]">
            For Organizers
          </span>
          <h2 className="axon-display mb-4 text-4xl text-white sm:text-5xl">
            {heading}
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-base leading-7 text-[#c4b5fd] sm:text-lg">
            {description}
          </p>
          <Link
            href={buttonHref}
            data-track={dataTrack}
            className="axon-pill gap-2 bg-white text-xs text-[#4C1D95] hover:bg-[#ede9fe]"
          >
            {buttonLabel}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          {feeNote && <p className="mt-4 text-xs font-semibold text-[#c4b5fd]">{feeNote}</p>}
      </div>
    </section>
  );
}
