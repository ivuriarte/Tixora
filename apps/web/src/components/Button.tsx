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
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-hover focus-visible:outline-primary',
    secondary: 'bg-gray-900 text-white hover:bg-gray-700',
    outline: 'border border-gray-300 text-gray-700 hover:border-gray-400 bg-white',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3 text-base',
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
