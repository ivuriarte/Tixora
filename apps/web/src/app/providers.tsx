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
  const { setAuth, logout } = useAuthStore();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const refreshToken = getRefreshToken();
    if (!refreshToken) return;

    api
      .post<{ data: { accessToken: string; user: any } }>('/auth/refresh', { refreshToken })
      .then((res) => {
        setAccessToken(res.data.data.accessToken);
        api.get<{ data: any }>('/auth/me').then((me) => {
          setAuth(me.data.data, res.data.data.accessToken, refreshToken);
        });
      })
      .catch(() => logout());
  }, [setAuth, logout]);

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
