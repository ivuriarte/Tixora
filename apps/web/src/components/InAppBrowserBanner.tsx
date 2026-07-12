'use client';

import { useEffect, useState } from 'react';
import { useIsInAppBrowser } from '@/lib/useIsInAppBrowser';

export default function InAppBrowserBanner() {
  const isInApp = useIsInAppBrowser();
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    setIsAndroid(/android/i.test(navigator.userAgent));
    setCurrentUrl(window.location.href);
  }, []);

  if (!isInApp || dismissed) return null;

  const path = currentUrl.replace(/^https?:\/\//, '');
  const chromeIntentUrl = `intent://${path}#Intent;scheme=https;package=com.android.chrome;end`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // clipboard not available — user can still use the ⋯ menu tip
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-6 sm:pb-0">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-primary px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Open in your browser first</p>
              <p className="text-white/75 text-xs mt-0.5">Required for OTP codes to work</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-700 leading-relaxed">
            You&apos;re viewing this inside the Facebook app. The 6-digit OTP code sent to your email may not arrive or auto-fill correctly here.
          </p>

          {isAndroid ? (
            <a
              href={chromeIntentUrl}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Open in Chrome
            </a>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600 leading-relaxed space-y-1">
              <p className="font-medium text-gray-700">How to open in Safari:</p>
              <p>Tap the <strong>⋯</strong> button (top-right of this screen), then select <strong>&ldquo;Open in Safari&rdquo;</strong> or <strong>&ldquo;Open in Browser&rdquo;</strong>.</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="w-full py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            {copied ? '✓ Link copied — paste it in Chrome or Safari' : 'Copy link'}
          </button>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="w-full text-center text-xs text-gray-400 py-1 hover:text-gray-600 transition-colors"
          >
            Continue anyway (OTP may not arrive)
          </button>
        </div>
      </div>
    </div>
  );
}
