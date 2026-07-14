import { NextRequest, NextResponse } from 'next/server';

const legacyProductionHosts = new Set([
  'tixora-online-ticket-app.vercel.app',
]);

const canonicalProductionHost = 'axontickets.online';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase().split(':')[0];

  if (host && legacyProductionHosts.has(host)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.protocol = 'https';
    redirectUrl.hostname = canonicalProductionHost;
    redirectUrl.port = '';
    return NextResponse.redirect(redirectUrl, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
