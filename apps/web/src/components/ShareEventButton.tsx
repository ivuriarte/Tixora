'use client';

import { useState } from 'react';

interface ShareEventButtonProps {
  title: string;
  text: string;
  url?: string;
  className?: string;
}

export default function ShareEventButton({ title, text, url, className = '' }: ShareEventButtonProps) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const shareUrl = url ? new URL(url, window.location.origin).toString() : window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        setCopied(false);
      }
    }
  }

  return (
    <button type="button" onClick={share} className={className} aria-live="polite">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
      </svg>
      {copied ? 'Link Copied' : 'Invite Friends'}
    </button>
  );
}
