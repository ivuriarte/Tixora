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
    : description.slice(0, COLLAPSE_THRESHOLD) + '...';

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">About this event</h2>
      <div className="relative">
        <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">
          {displayText}
        </p>
        {shouldCollapse && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-dark transition-colors"
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
    </div>
  );
}
