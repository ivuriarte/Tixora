'use client';

/**
 * VenueMap — event venue map component.
 *
 * When latitude + longitude are provided: renders an interactive Google Maps
 * iframe (no API key required). The iframe is lazy-loaded so it never blocks
 * the initial paint.
 *
 * When coordinates are absent: falls back to the signed Mapbox static image
 * served by /api/map-image.
 *
 * When both fail: degrades to a plain text "View on Google Maps" link.
 */

import Image from 'next/image';
import { useState } from 'react';

interface Props {
  /** Pre-signed URL built server-side — do NOT construct this on the client. */
  mapSrc: string;
  venue: string;
  address?: string | null;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
}

export default function VenueMap({ mapSrc, venue, address, city, latitude, longitude }: Props) {
  const [imgError, setImgError] = useState(false);

  const hasCoords = latitude != null && longitude != null;

  // Deep-link query that works for both Google Maps web and the native Maps apps.
  const mapsQuery = encodeURIComponent(
    [venue, address, city, 'Philippines'].filter(Boolean).join(', '),
  );
  const googleMapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  // Google Maps Embed API — free, unlimited, no per-load charge.
  // Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY with Maps Embed API enabled in GCP.
  // Falls back to OpenStreetMap when the key is absent (local dev).
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
  const embedUrl = hasCoords
    ? googleMapsKey
      ? `https://www.google.com/maps/embed/v1/place?key=${googleMapsKey}&q=${latitude},${longitude}&zoom=15`
      : `https://www.openstreetmap.org/export/embed.html?bbox=${longitude! - 0.004},${latitude! - 0.004},${longitude! + 0.004},${latitude! + 0.004}&layer=mapnik&marker=${latitude},${longitude}`
    : null;

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">

      {/* ── Interactive Google Maps iframe (when coordinates are known) ── */}
      {hasCoords && embedUrl ? (
        <div className="relative aspect-[2/1] bg-gray-100">
          <iframe
            src={embedUrl}
            title={`Map showing ${venue}, ${city}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="absolute inset-0 w-full h-full border-0"
            aria-label={`Interactive map for ${venue}`}
          />
        </div>
      ) : !imgError ? (
        /* ── Static Mapbox image fallback (when no coordinates) ── */
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
            unoptimized
          />
          <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm text-xs font-medium text-gray-700 px-2 py-1 rounded-md shadow-sm flex items-center gap-1 pointer-events-none select-none">
            <svg className="w-3.5 h-3.5 text-primary" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            Open in Maps
          </div>
        </a>
      ) : (
        /* ── Text fallback when static image also fails ── */
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-5 text-sm font-medium text-primary hover:text-purple-800 transition-colors"
        >
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          View {venue} on Google Maps →
        </a>
      )}

      {/* ── Venue name + address + directions footer ── */}
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
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  );
}
