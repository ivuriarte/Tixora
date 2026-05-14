'use client';

import { useEffect, useState } from 'react';
import { secondsUntil } from '@tixora/utils';

interface Props {
  expiresAt: Date;
  onExpire?: () => void;
}

export default function CountdownTimer({ expiresAt, onExpire }: Props) {
  const [seconds, setSeconds] = useState(() => Math.max(0, secondsUntil(expiresAt)));

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, secondsUntil(expiresAt));
      setSeconds(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <span className={`font-bold tabular-nums ${seconds < 60 ? 'text-red-600' : 'text-amber-700'}`}>
      {mins}:{String(secs).padStart(2, '0')}
    </span>
  );
}
