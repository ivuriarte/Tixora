'use client';

import { useEffect, useState } from 'react';

/**
 * Known in-app browser user-agent patterns.
 * Google OAuth (disallowed_useragent / Error 403) is blocked in all of these.
 */
const IN_APP_PATTERNS = [
  /FBAN/i,             // Facebook
  /FBAV/i,             // Facebook
  /FB_IAB/i,           // Facebook in-app browser
  /FBIOS/i,            // Facebook iOS
  /Instagram/i,        // Instagram
  /BytedanceWebview/i, // TikTok
  /musical_ly/i,       // TikTok (older)
  /MicroMessenger/i,   // WeChat
  /\bLine\b/i,         // LINE
  /LinkedInApp/i,      // LinkedIn
  /\bTwitter\b/i,      // Twitter / X
  /Snapchat/i,         // Snapchat
  /GSA\//i,            // Google Search App (iOS)
];

/**
 * Returns true when the page is running inside a known in-app WebView browser
 * where Google OAuth will be blocked (Error 403: disallowed_useragent).
 *
 * Safe to call on server — always returns false until hydration.
 */
export function useIsInAppBrowser(): boolean {
  const [isInApp, setIsInApp] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsInApp(IN_APP_PATTERNS.some((pattern) => pattern.test(ua)));
  }, []);

  return isInApp;
}
