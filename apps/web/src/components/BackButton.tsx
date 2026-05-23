'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface Props {
  /** Override destination. Defaults to router.back(). */
  href?: string;
  label?: string;
  className?: string;
}

export default function BackButton({ href, label = 'Back', className = '' }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const onClick = () => {
    startTransition(() => {
      if (href) router.push(href);
      else router.back();
    });
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className={`inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-all duration-150 active:scale-[0.97] disabled:opacity-50 ${className}`}
      aria-label={label}
      aria-busy={isPending}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className={`h-4 w-4 transition-transform duration-200 ${isPending ? 'animate-pulse-soft' : ''}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  );
}
