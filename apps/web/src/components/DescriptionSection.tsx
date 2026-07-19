'use client';

import { useState } from 'react';

interface DescriptionSectionProps {
  description: string;
}

const COLLAPSE_THRESHOLD = 300;

export default function DescriptionSection({ description }: DescriptionSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldCollapse = description.length > COLLAPSE_THRESHOLD;
  const displayText = !shouldCollapse || isExpanded 
    ? description 
    : `${description.slice(0, COLLAPSE_THRESHOLD).trimEnd()}…`;

  return (
    <section aria-labelledby="event-description-heading">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Event overview</p>
      <h2 id="event-description-heading" className="mt-2 text-3xl font-black tracking-[-0.03em] text-[#1a0533] sm:text-4xl">About this event</h2>
      <div className="relative">
        <p id="event-description" className="mt-5 max-w-3xl whitespace-pre-wrap text-base leading-8 text-[#6b5b8a]">
          {displayText}
        </p>
        {shouldCollapse && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary transition-colors hover:text-primary-dark"
            aria-expanded={isExpanded}
            aria-controls="event-description"
          >
            {isExpanded ? (
              <>
                See Less
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </>
            ) : (
              <>
                See More
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </>
            )}
          </button>
        )}
      </div>
    </section>
  );
}
