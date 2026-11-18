'use client';

import { useEffect, useState } from 'react';
import { secondsUntil } from '@/lib/otpCooldown';

/**
 * Seconds left until `untilMs` (epoch milliseconds), re-rendering about twice a second while it
 * runs and stopping at 0. Pass 0 for "no wait".
 */
export function useSecondsUntil(untilMs: number): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (untilMs <= Date.now()) return;
    const id = setInterval(() => {
      setTick((tick) => tick + 1);
      if (Date.now() >= untilMs) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [untilMs]);
  return secondsUntil(untilMs, Date.now());
}
