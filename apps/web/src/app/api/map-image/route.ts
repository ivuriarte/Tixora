/**
 * GET /api/map-image?venue=...&city=...&sig=...
 *
 * Server-side Mapbox proxy. Geocodes the venue/city, then fetches a Mapbox Static
 * Images PNG and streams it to the browser. The Mapbox secret token is NEVER sent
 * to the client — it lives only in this server-side route.
 *
 * Required env vars:
 *   MAPBOX_SECRET_TOKEN       — Mapbox secret token (server-only, no NEXT_PUBLIC_)
 *
 * Optional env vars:
 *   MAP_IMAGE_SIGNING_SECRET  — When set, all requests must carry a valid HMAC-SHA256
 *                               signature to prevent arbitrary geocoding abuse.
 *                               Strongly recommended in production.
 *
 * Caching:
 *   - Mapbox API calls use Next.js data cache with 7-day revalidation.
 *   - The response carries `Cache-Control: public, s-maxage=604800` so the Vercel
 *     Edge CDN caches the PNG per unique venue+city URL for 7 days.
 *   - After the first warm-up request, subsequent requests never hit Mapbox at all.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';

const TOKEN = process.env.MAPBOX_SECRET_TOKEN;
const SIGNING_SECRET = process.env.MAP_IMAGE_SIGNING_SECRET;

/** Maximum length accepted for venue / city query params. */
const MAX_PARAM_LEN = 200;

/**
 * Constant-time string comparison — prevents timing side-channel leaks when
 * comparing the submitted HMAC signature against the expected value.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify the HMAC-SHA256 signature on the request.
 * Returns true unconditionally when SIGNING_SECRET is not configured,
 * so the feature degrades gracefully in development / without the env var.
 */
function verifySignature(venue: string, city: string, sig: string): boolean {
  if (!SIGNING_SECRET) return true;
  const expected = createHmac('sha256', SIGNING_SECRET)
    .update(`${venue}:${city}`)
    .digest('hex')
    .slice(0, 16);
  return timingSafeStringEqual(sig, expected);
}

export async function GET(req: NextRequest) {
  // --- Guard: service not configured ---
  if (!TOKEN) {
    return new NextResponse(null, {
      status: 503,
      statusText: 'Map service not configured',
    });
  }

  // --- Input validation ---
  const { searchParams } = new URL(req.url);
  const venue = (searchParams.get('venue') ?? '').trim().slice(0, MAX_PARAM_LEN);
  const city = (searchParams.get('city') ?? '').trim().slice(0, MAX_PARAM_LEN);
  const sig = (searchParams.get('sig') ?? '').trim();

  if (!venue && !city) {
    return new NextResponse(null, { status: 400, statusText: 'Missing venue or city' });
  }

  // --- Signature verification (when secret is configured) ---
  if (SIGNING_SECRET && !verifySignature(venue, city, sig)) {
    return new NextResponse(null, { status: 401, statusText: 'Invalid signature' });
  }

  try {
    // --- Step 1: Forward geocoding — venue + city → [lng, lat] ---
    const q = encodeURIComponent(`${venue}, ${city}, Philippines`);
    const geoRes = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?country=PH&limit=1&access_token=${TOKEN}`,
      // Next.js data cache: store this geocoding result for 7 days.
      // Same venue+city combo will not call Mapbox again until the cache expires.
      { next: { revalidate: 604800 } },
    );

    if (!geoRes.ok) {
      return new NextResponse(null, { status: 502, statusText: 'Geocoding failed' });
    }

    const geoJson = (await geoRes.json()) as {
      features?: Array<{ center: [number, number] }>;
    };
    const center = geoJson.features?.[0]?.center;

    if (!center) {
      // Venue not found — caller should show a text fallback link.
      return new NextResponse(null, { status: 404, statusText: 'Venue not found' });
    }

    const [lng, lat] = center;

    // --- Step 2: Fetch static map PNG ---
    // 600×300 @2x = 1200×600 physical pixels, rendering crisply on retina screens.
    // Brand-purple pin (#7c3aed = Tailwind violet-700).
    const pin = `pin-s+7c3aed(${lng},${lat})`;
    const viewport = `${lng},${lat},14`;
    const mapRes = await fetch(
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pin}/${viewport}/600x300@2x?access_token=${TOKEN}`,
      { next: { revalidate: 604800 } },
    );

    if (!mapRes.ok) {
      return new NextResponse(null, { status: 502, statusText: 'Static map failed' });
    }

    const imageBuffer = await mapRes.arrayBuffer();

    // s-maxage: Vercel Edge CDN caches this PNG for 7 days, keyed by the full URL
    // (which encodes the unique venue+city).  stale-while-revalidate gives a 1-day
    // grace period so there is no thundering-herd on expiry.
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400',
        Vary: 'Accept-Encoding',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502, statusText: 'Map service error' });
  }
}
