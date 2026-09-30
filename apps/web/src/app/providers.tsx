'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';
import { getQueryClient } from '@/lib/query-client';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { getRefreshToken, getLoginPortal } from '@/lib/auth';
import api from '@/lib/api';
import axios from 'axios';
import { refreshSession } from '@/lib/session';

function AuthHydrator({ children }: { children: React.ReactNode }) {
  const { setAuth, logout, setHydrating } = useAuthStore();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      setHydrating(false);
      return;
    }

    setHydrating(true);

    refreshSession()
      .then(({ accessToken, refreshToken: newRefreshToken }) =>
        api.get<{ data: any }>('/auth/me').then((me) => {
          // Merge the persisted loginPortal so portal context survives page refresh
          setAuth({ ...me.data.data, loginPortal: getLoginPortal() ?? undefined }, accessToken, newRefreshToken);
        }),
      )
      .catch((err) => {
        // Keep the stored session only when the server was unreachable, so a reload can recover it.
        const unreachable = axios.isAxiosError(err) && !err.response;
        if (!unreachable) logout();
      })
      .finally(() => setHydrating(false));
  }, [setAuth, logout, setHydrating]);

  return <>{children}</>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  // Prevent the mouse-wheel from changing the value of focused number inputs.
  // When the user scrolls the page while a <input type="number"> still has focus,
  // the browser increments/decrements it. Blurring on wheel restores expected behaviour.
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number' && document.activeElement === target) {
        (target as HTMLInputElement).blur();
      }
    }
    document.addEventListener('wheel', handleWheel, { passive: true });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydrator>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: '12px',
              padding: '12px 16px',
              fontSize: '14px',
              maxWidth: '420px',
            },
            success: {
              duration: 4000,
              iconTheme: { primary: '#16a34a', secondary: '#fff' },
            },
            error: {
              duration: 6000,
              iconTheme: { primary: '#dc2626', secondary: '#fff' },
            },
          }}
        />
        {process.env.NEXT_PUBLIC_APP_ENV === 'development' && <ReactQueryDevtools />}
      </AuthHydrator>
    </QueryClientProvider>
  );
}
