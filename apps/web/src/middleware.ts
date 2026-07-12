import { NextRequest, NextResponse } from 'next/server';

const legacyProductionHosts = new Set([
  'tixora-online-ticket-app.vercel.app',
]);

const offTheRecordEventUrl = 'https://axontickets.online/events/off-the-record-bar-talks-cqa1a';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase().split(':')[0];

  if (host && legacyProductionHosts.has(host)) {
    return NextResponse.redirect(offTheRecordEventUrl, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
