'use client';

/**
 * VenueMap — static Mapbox map for an event venue.
 *
 * Renders a click-through static map image served by /api/map-image (server-side
 * Mapbox proxy, token never exposed to the browser).  Clicking the map or the
 * "Get directions" button opens Google Maps in a new tab.
 *
 * On image load failure (token not configured, venue not found, network error)
 * the component gracefully degrades to a plain text directions link.
 */

import Image from 'next/image';
import { useState } from 'react';

interface Props {
  /** Pre-signed URL built server-side — do NOT construct this on the client. */
  mapSrc: string;
  venue: string;
  address?: string | null;
  city: string;
}

export default function VenueMap({ mapSrc, venue, address, city }: Props) {
  const [imgError, setImgError] = useState(false);

  // Deep-link query that works for both Google Maps web and the native Maps apps.
  const mapsQuery = encodeURIComponent(
    [venue, address, city, 'Philippines'].filter(Boolean).join(', '),
  );
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
      {/* Map image — or text fallback on error */}
      {!imgError ? (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${venue} in Google Maps`}
          className="block relative aspect-[2/1] bg-gray-100"
        >
          <Image
            src={mapSrc}
            alt={`Map showing ${venue}, ${city}`}
            fill
            className="object-cover transition-opacity duration-300"
            sizes="(min-width: 1024px) 640px, 100vw"
            onError={() => setImgError(true)}
            // Skip Next.js image optimizer — our route handler already returns an
            // appropriately-sized, cached Mapbox retina PNG.
            unoptimized
          />
          {/* "Open in Maps" hint badge */}
          <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm text-xs font-medium text-gray-700 px-2 py-1 rounded-md shadow-sm flex items-center gap-1 pointer-events-none select-none">
            <svg
              className="w-3.5 h-3.5 text-primary"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                clipRule="evenodd"
              />
            </svg>
            Open in Maps
          </div>
        </a>
      ) : (
        /* Fallback: plain directions link shown when map cannot load */
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-5 text-sm font-medium text-primary hover:text-purple-800 transition-colors"
        >
          <svg
            className="w-4 h-4 shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
              clipRule="evenodd"
            />
          </svg>
          View {venue} on Google Maps →
        </a>
      )}

      {/* Venue name + address footer */}
      <div className="px-4 py-3 flex items-start justify-between gap-4 border-t border-gray-50">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{venue}</p>
          {address && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{address}</p>
          )}
          <p className="text-xs text-gray-500">{city}, Philippines</p>
        </div>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-semibold text-primary hover:text-purple-800 transition-colors flex items-center gap-1 mt-0.5 whitespace-nowrap"
        >
          Get directions
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
