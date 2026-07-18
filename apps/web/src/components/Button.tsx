import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, useCallback, useEffect, useRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

/**
 * Button with a synchronous ref-based click guard.
 *
 * Problem it solves: React's state updates are asynchronous — there is a
 * 2–16 ms window between the first click and when `disabled={loading}` takes
 * effect. During that window a second (or third) click can fire, causing
 * duplicate API calls or navigation. Using a `useRef` guard is synchronous
 * (runs before React re-renders), so the guard engages on the very first click.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  onClick,
  children,
  ...props
}: ButtonProps) {
  const clickedRef = useRef(false);

  // Reset the guard whenever loading transitions back to false, so the
  // button becomes re-clickable after the async operation completes.
  useEffect(() => {
    if (!loading) {
      clickedRef.current = false;
    }
  }, [loading]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (clickedRef.current || disabled || loading) return;
      clickedRef.current = true;
      onClick?.(e);
    },
    [onClick, disabled, loading],
  );

  const base =
    'inline-flex min-h-[44px] items-center justify-center rounded-[40px] font-bold uppercase tracking-[0.06em] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50';

  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-hover focus-visible:outline-primary',
    secondary: 'bg-[#1a0533] text-white hover:bg-[#4c1d95]',
    outline: 'border border-[#d3c8e8] text-[#4f416c] hover:border-primary hover:text-primary bg-white',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };

  const sizes = {
    sm: 'px-4 text-xs',
    md: 'px-5 text-sm',
    lg: 'min-h-[48px] px-7 text-sm',
  };

  const isBusy = loading || (clickedRef.current && !disabled);

  return (
    <button
      disabled={disabled || loading}
      aria-busy={isBusy}
      aria-disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
      onClick={handleClick}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
