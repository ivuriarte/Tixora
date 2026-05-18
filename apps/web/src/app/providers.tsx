'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';
import { getQueryClient } from '@/lib/query-client';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { getRefreshToken, setAccessToken } from '@/lib/auth';
import api from '@/lib/api';

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

    api
      .post<{ data: { accessToken: string; refreshToken: string } }>('/auth/refresh', { refreshToken })
      .then((res) => {
        const newAccessToken = res.data.data.accessToken;
        const newRefreshToken = res.data.data.refreshToken;
        setAccessToken(newAccessToken);
        return api.get<{ data: any }>('/auth/me').then((me) => {
          // Use the NEW rotated refreshToken — storing the old one would break the next reload
          setAuth(me.data.data, newAccessToken, newRefreshToken);
        });
      })
      .catch(() => logout())
      .finally(() => setHydrating(false));
  }, [setAuth, logout, setHydrating]);

  return <>{children}</>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydrator>
        {children}
        <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
        {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
      </AuthHydrator>
    </QueryClientProvider>
  );
}
