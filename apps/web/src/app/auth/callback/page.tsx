'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { setAccessToken, setRefreshToken } from '@/lib/auth';
import api from '@/lib/api';

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const isAdmin = params.get('isAdmin') === 'true';

    if (!accessToken || !refreshToken) {
      router.replace('/auth/login?error=oauth_failed');
      return;
    }

    // Store tokens
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);

    // Fetch full user profile then hydrate store
    api
      .get<{ data: any }>('/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .then((res) => {
        setAuth(res.data.data, accessToken, refreshToken);
        router.replace(isAdmin ? '/admin' : '/');
      })
      .catch(() => {
        router.replace('/auth/login?error=oauth_failed');
      });
  }, [params, router, setAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500 text-sm">Signing you in…</p>
    </div>
  );
}
